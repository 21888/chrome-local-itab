const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const Manager = require('../storage.js');
const Backup = require('../shared/complete-backup.js');
const Tasks = require('../shared/local-tasks-store.js');
const Scratchpad = require('../shared/local-scratchpad-store.js');
const Countdown = require('../shared/local-countdown-store.js');
const Focus = require('../shared/local-focus-store.js');
const Workspace = require('../shared/workspace-presets.js');
global.crypto = webcrypto;
const copy = value => structuredClone(value);
const now = '2026-10-10T12:00:00.000Z';
function fixture(initial = {}) {
    const raw = copy(initial), writes = [], lockNames = [], queues = new Map(), hooks = {};
    const manager = new Manager();
    manager.ensureSyncInitialized = () => { throw new Error('Provider initialization forbidden'); };
    manager.scheduleSyncPush = () => { throw new Error('Provider writes forbidden'); };
    const locks = { request(name, options, fn) {
        if (typeof options === 'function') fn = options;
        lockNames.push(name);
        const p = (queues.get(name) || Promise.resolve()).then(fn);
        queues.set(name, p.catch(() => {})); return p;
    } };
    const chrome = { storage: { local: {
        async get(keys) {
            if (hooks.read) return hooks.read(keys, raw);
            return Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, copy(raw[key])]));
        },
        async set(values) {
            writes.push(copy(values));
            if (hooks.set) return hooks.set(values, raw);
            Object.assign(raw, copy(values));
        }
    }, onChanged: { addListener() {}, removeListener() {} } } };
    const backend = Backup.createBackend(manager, chrome, locks);
    let n = 0;
    const store = new Backup.Store(manager, backend, { now: () => now, id: () => `fresh_token_${++n}` });
    return { store, manager, raw, writes, lockNames, hooks, locks, chrome, backend };
}
const task = (id, state = 'active') => ({ id, version: `version_${id}`, text: id, state, removedFrom: state === 'removed' ? 'done' : null, createdAt: now, updatedAt: now });
function populated() {
    const tasks = Tasks.initial();
    tasks.enabled = true; tasks.revision = 7; tasks.records = [task('task_one'), task('task_two', 'done'), task('task_three', 'removed')]; tasks.pinnedId = 'task_one'; tasks.receipts = ['old_receipt'];
    tasks.recovery = Array.from({ length: 8 }, (_, n) => ({ id: `history_${n}`, createdAt: now, content: { records: [task(`history_task_${n}`)], pinnedId: null } }));
    const focus = Focus.initial(); focus.enabled = true; focus.revision = 3;

    return { [Tasks.KEY]: tasks, [Scratchpad.KEY]: { ...Scratchpad.initial(), revision: 4, enabled: true, content: 'Saved\n✍️ draft' }, [Countdown.KEY]: { ...Countdown.initial(), revision: 5, enabled: true, title: 'Holiday', targetDate: '2027-01-01' }, [Focus.KEY]: focus,
        quote: 'Saved quote', bg: { type: 'image', value: 'data:image/png;base64,QUJD' }, movie: { title: 'Film', note: 'Note', poster: 'data:image/png;base64,REVG' },
        links: [{ title: 'Site', url: 'https://example.com/', category: 'work', icon: 'data:image/png;base64,R0hJ' }],
        sync: { enabled: true, lastSync: 'local', lastError: '', includeLargeAssets: true, futureDevicePreference: 'preserve' },
        __auth: 'SECRET_AUTH', __updatePreferences: { channel: 'stable' }, __unrelated: 'untouched'
    };
}
async function source() { return fixture(populated()).store.export(); }
function code(expected) { return error => error.code === expected; }

test('fresh defaults and selected archive round-trip, read-only and no providers', async () => {
    const f = fixture(); const file = JSON.parse(await f.store.export());
    assert.deepEqual(Object.keys(file.modules), Backup.MODULES);
    assert.equal(file.format, Backup.FORMAT); assert.equal(file.schemaVersion, 1);
    assert.equal(f.writes.length, 0);
    const partial = JSON.parse(await f.store.export(['scratchpad', 'config']));
    assert.deepEqual(Object.keys(partial.modules), ['config', 'scratchpad']);
    assert(!Object.hasOwn(partial.modules.config.data, 'sync'));
    assert.deepEqual(f.lockNames.slice(0, 3), [Tasks.LOCK, Focus.LOCK, 'local-itab-local-write']);
});

test('complete archive preserves all retained content/images and excludes credentials/preferences/sessions', async () => {
    const saved = populated(); saved[Focus.KEY].session = { id: 'session_one', phase: 'focus', status: 'running', remainingMs: 1500000, startedAt: 1, deadline: 1500001 };
    const f = fixture(saved), text = await f.store.export(), file = JSON.parse(text);
    assert.equal(file.modules.tasks.recovery.length, 8);
    assert.equal(file.modules.tasks.records.length, 3);
    assert.equal(file.modules.scratchpad.content, 'Saved\n✍️ draft');
    assert.equal(file.modules.config.data.bg.value, populated().bg.value);
    assert.equal(file.modules.config.data.links[0].icon, populated().links[0].icon);
    for (const word of ['SECRET_AUTH', 'futureDevicePreference', '__updatePreferences', 'session_one', 'receipts', 'revision']) assert(!text.includes(word), word);
    assert(!Object.hasOwn(file.modules.focus, 'session'));
});

test('all modules restore with complete prior history recovery and fresh editor identities', async () => {
    const initial = populated(); initial.quote = 'Destination'; initial[Tasks.KEY].records[0].text = 'Destination task';
    const f = fixture(initial), preview = await f.store.review(await source());
    assert.equal(preview.incoming.tasks.recovery, 8);
    assert.equal(preview.incoming.config.dataUrlIcons, 1);
    assert.equal((await f.store.restore(preview, { confirmed: true })).changed, true);
    assert.equal(f.writes.length, 2);
    assert.deepEqual(Object.keys(f.writes[0]), [Backup.RECOVERY_KEY]);
    assert.equal(f.raw[Tasks.KEY].recovery.length, 8); assert.equal(f.raw[Tasks.KEY].revision, 8);
    assert.equal(f.raw[Scratchpad.KEY].revision, 5); assert.equal(f.raw[Countdown.KEY].revision, 6); assert.equal(f.raw[Focus.KEY].revision, 4);
    assert(f.raw[Tasks.KEY].records.every((t, n) => t.version !== initial[Tasks.KEY].records[n].version));
    assert.equal(f.raw[Tasks.KEY].receipts[0], 'old_receipt'); assert.notEqual(f.raw[Tasks.KEY].receipts.at(-1), 'old_receipt');
    assert.equal(f.raw[Focus.KEY].session.status, 'ready'); assert.equal(f.raw[Focus.KEY].session.id, null);
    assert.deepEqual(f.raw.sync, initial.sync); assert.equal(f.raw.__auth, 'SECRET_AUTH'); assert.deepEqual(f.raw.__updatePreferences, initial.__updatePreferences);
    assert.equal(f.raw[f.manager.syncIdentityStateKey].blocked.kind, 'restore');
    assert(f.raw[f.manager.settingsGenerationKey]); assert(f.raw[f.manager.layoutGenerationKey]);
    const before = JSON.parse(await f.store.recovery());
    assert.equal(before.modules.config.data.quote, 'Destination'); assert.equal(before.modules.tasks.records[0].text, 'Destination task'); assert.equal(before.modules.tasks.recovery.length, 8);
});

test('selection preserves every unselected storage key and ongoing Focus session exactly', async () => {
    const saved = populated(); saved[Focus.KEY].session = { id: 'session_one', phase: 'focus', status: 'running', remainingMs: 1500000, startedAt: 1, deadline: 1500001 };
    const f = fixture(saved), before = copy(f.raw);
    const file = JSON.parse(await source()); file.modules.scratchpad.content = 'Replacement';
    const preview = await f.store.review(JSON.stringify(file), ['scratchpad']);
    await f.store.restore(preview, { confirmed: true });
    for (const [key, value] of Object.entries(before)) if (key !== Scratchpad.KEY) assert.deepEqual(f.raw[key], value, key);
    assert.equal(f.raw[Scratchpad.KEY].content, 'Replacement');
    assert.deepEqual(Object.keys(f.writes[1]), [Scratchpad.KEY]);
});

test('confirmation and a live opaque review ticket are mandatory; preview mutation cannot change transaction', async () => {
    const f = fixture(), p = await f.store.review(await source(), ['scratchpad']);
    assert.throws(() => f.store.restore(p), code('CONFIRMATION'));
    assert.throws(() => f.store.restore({ ...p }, { confirmed: true }), code('CONFLICT'));
    p.selected.push('config'); p.incoming.scratchpad.characters = 0;
    await f.store.restore(p, { confirmed: true }); assert.deepEqual(Object.keys(f.writes[1]), [Scratchpad.KEY]);
    assert.throws(() => f.store.restore(p, { confirmed: true }), code('CONFLICT'));
});

for (const selection of [[], ['bad'], ['tasks', 'tasks']]) test(`selection fails closed: ${JSON.stringify(selection)}`, async () => {
    const f = fixture(); assert.throws(() => f.store.export(selection), code('INVALID'));
    assert.throws(() => f.store.review('{}', selection)); assert.equal(f.writes.length, 0);
});

for (const mutate of [
    file => { file.schemaVersion = 2; }, file => { file.futureWorkspaces = {}; }, file => { delete file.modules.tasks.records; },
    file => { file.modules.focus.session = {}; }, file => { file.modules.tasks.receipts = []; },
    file => { file.modules.config.data.sync = {}; }, file => { file.modules.tasks.schemaVersion = 99; },
    file => { file.modules.config.data.links[0].url = 'javascript:alert(1)'; },
    file => { file.modules.config.data.quote = { bad: true }; }, file => { file.modules.config.data.layout.positions.x = { x: NaN, y: 2 }; }
]) test(`malformed archive rejected before any writes (${mutate.toString()})`, async () => {
    const f = fixture(), file = JSON.parse(await source()); mutate(file);
    assert.throws(() => f.store.review(JSON.stringify(file), ['scratchpad'])); assert.equal(f.writes.length, 0);
});

test('missing requested module rejects; corrupt unselected module also rejects whole archive', async () => {
    const f = fixture(), partial = await f.store.export(['scratchpad']);
    assert.throws(() => f.store.review(partial, ['tasks']), code('INVALID'));
    const file = JSON.parse(await source()); file.modules.tasks.recovery[0].content.records[0].state = 'wrong';
    assert.throws(() => f.store.review(JSON.stringify(file), ['scratchpad']), code('INVALID'));
});

test('source limits apply before parse; recursive state has bounded depth', () => {
    const f = fixture(); assert.throws(() => f.store.review(' '.repeat(Backup.LIMITS.bytes + 1)), code('SIZE_LIMIT'));
    const text = '{"x":'.repeat(40) + 'null' + '}'.repeat(40);
    assert.throws(() => f.store.review(text), code('SIZE_LIMIT'));
    assert.equal(f.writes.length, 0);
});

for (const invalid of [null, { schemaVersion: 99 }, { ...Scratchpad.initial(), content: 42 }]) test(`corrupt current module blocks full archive/review but not unselected export: ${JSON.stringify(invalid)}`, async () => {
    const f = fixture({ [Scratchpad.KEY]: invalid });
    await assert.rejects(f.store.export(), code('CORRUPT'));
    assert.deepEqual(Object.keys(JSON.parse(await f.store.export(['config'])).modules), ['config']);
    await assert.rejects(f.store.review(await source(), ['tasks']), code('CORRUPT')); assert.equal(f.writes.length, 0);
});

test('malformed current config is not silently normalized into replacement recovery', async () => {
    for (const raw of [{ links: [{ title: 'Bad', url: 'ftp://bad', category: 'work' }] }, { schemaVersion: 99 }, { quote: 42 }, { bg: { type: 'image', value: 'not image' } }, { appearance: { template: 'unknown', colorMode: 'light' } }]) {
        const f = fixture(raw); await assert.rejects(f.store.export(), code('CORRUPT')); assert.equal(f.writes.length, 0);
    }
});

test('read failure and malformed response do not become fresh defaults', async () => {
    for (const read of [() => { throw Error('read'); }, () => null, () => []]) {
        const f = fixture(); f.hooks.read = read;
        await assert.rejects(f.store.export(), code('READ')); assert.equal(f.writes.length, 0);
    }
});

test('fresh baseline covers equal-content revision changes and provider changes', async () => {
    for (const mutate of [raw => { raw[Scratchpad.KEY].revision++; }, raw => { raw.sync.enabled = false; }, raw => { raw.quote = 'changed'; }]) {
        const f = fixture(populated()), p = await f.store.review(await source(), ['scratchpad']); mutate(f.raw);
        await assert.rejects(f.store.restore(p, { confirmed: true }), code('CONFLICT')); assert.equal(f.writes.length, 0);
    }
});

test('revision overflow fails before recovery or target writes', async () => {
    const f = fixture({ [Scratchpad.KEY]: { ...Scratchpad.initial(), revision: Number.MAX_SAFE_INTEGER } });
    const p = await f.store.review(await source(), ['scratchpad']);
    await assert.rejects(f.store.restore(p, { confirmed: true }), code('CORRUPT')); assert.equal(f.writes.length, 0);
});

for (const mode of ['throw', 'false', 'drop', 'mismatch', 'read']) test(`recovery ${mode} failure prevents target mutation`, async () => {
    const f = fixture(populated()), p = await f.store.review(await source()); const before = copy(f.raw);
    f.hooks.set = (values, raw) => {
        if (mode === 'throw') throw Error('quota');
        if (mode === 'false') return false;
        if (mode === 'drop') return;
        Object.assign(raw, copy(values));
        if (mode === 'mismatch') raw[Backup.RECOVERY_KEY].checksum = 'bad';
        if (mode === 'read') f.hooks.read = () => { throw Error('read'); };
    };
    await assert.rejects(f.store.restore(p, { confirmed: true }), code('RECOVERY'));
    assert.equal(f.writes.length, 1);
    for (const [key, value] of Object.entries(before)) assert.deepEqual(f.raw[key], value, key);
});

for (const mode of ['throwBefore', 'throwAfter', 'drop', 'partial', 'readback']) test(`target ${mode} is uncertain, never success/rollback/retry; recovery remains available`, async () => {
    const f = fixture(populated()), p = await f.store.review(await source());
    f.hooks.set = (values, raw) => {
        if (Object.hasOwn(values, Backup.RECOVERY_KEY)) { Object.assign(raw, copy(values)); return; }
        if (mode === 'throwBefore') throw Error('write');
        if (mode === 'drop') return;
        if (mode === 'partial') { raw[Scratchpad.KEY] = values[Scratchpad.KEY]; return; }
        Object.assign(raw, copy(values));
        if (mode === 'throwAfter') throw Error('write acknowledgement');
        if (mode === 'readback') f.hooks.read = () => { throw Error('read'); };
    };
    await assert.rejects(f.store.restore(p, { confirmed: true }), error => error.code === 'UNCONFIRMED' && error.mayHaveCommitted);
    assert.equal(f.writes.length, 2); delete f.hooks.read;
    assert.equal(JSON.parse(await f.store.recovery()).modules.tasks.recovery.length, 8);
});

test('cancel guards run before recovery and before target write', async () => {
    const f = fixture(), p = await f.store.review(await source());
    await assert.rejects(f.store.restore(p, { confirmed: true, isCurrent: () => false }), code('CANCELLED')); assert.equal(f.writes.length, 0);
    let current = true; const q = await f.store.review(await source());
    f.hooks.set = (values, raw) => { Object.assign(raw, copy(values)); current = false; };
    await assert.rejects(f.store.restore(q, { confirmed: true, isCurrent: () => current }), code('CANCELLED')); assert.equal(f.writes.length, 1);
});

test('out-of-band change during recovery write aborts target commit', async () => {
    const f = fixture(), p = await f.store.review(await source());
    f.hooks.set = (values, raw) => { Object.assign(raw, copy(values)); raw.quote = 'new external value'; };
    await assert.rejects(f.store.restore(p, { confirmed: true }), code('CONFLICT')); assert.equal(f.writes.length, 1);
});

test('stale task edit and stale acknowledged add retry fail after full restore', async () => {
    const f = fixture(populated()), old = copy(f.raw[Tasks.KEY].records[0]);
    await f.store.restore(await f.store.review(await source(), ['tasks']), { confirmed: true });
    const tasks = new Tasks.Store(Tasks.createChromeBackend(f.chrome, f.locks), { id: () => 'new_command', now: () => now });
    await assert.rejects(tasks.mutate({ kind: 'edit', id: old.id, version: old.version, text: 'Stale', operationId: 'edit_old_one' }), code('CONFLICT'));
    await assert.rejects(tasks.mutate({ kind: 'add', text: 'Replay', operationId: 'old_receipt' }), code('CONFLICT'));
});

test('dedicated stores and workspace preset queued with restore serialize without nested-lock deadlock', async () => {
    const f = fixture(populated()), p = await f.store.review(await source(), ['scratchpad']);
    const scratch = new Scratchpad.Store(Scratchpad.createChromeBackend(f.chrome, f.locks));
    const workspace = new Workspace.Store(Workspace.createBackend(f.chrome, f.locks));
    await Promise.all([f.store.restore(p, { confirmed: true }), workspace.prepare('clarity')]);
    await assert.rejects(scratch.mutate({ kind: 'content', revision: 4, value: 'Old draft' }), code('CONFLICT'));
    assert.equal(f.raw[Scratchpad.KEY].revision, 5);
});

test('tampered recovery cannot be exported as verified', async () => {
    const f = fixture(); await f.store.restore(await f.store.review(await source()), { confirmed: true });
    f.raw[Backup.RECOVERY_KEY].source = '{}'; await assert.rejects(f.store.recovery(), code('RECOVERY'));
});

for (const status of ['running', 'paused', 'uncertain']) test(`selected Focus ${status} is preserved and blocks restore before writes`, async () => {
    const state = Focus.initial(); state.session = { id: 'active_session', phase: 'focus', status, remainingMs: 10000, startedAt: status === 'running' ? 1 : null, deadline: status === 'running' ? 10001 : null };
    const f = fixture({ [Focus.KEY]: state }), p = await f.store.review(await source());
    assert.equal(p.current.focus.activeSession, true);
    await assert.rejects(f.store.restore(p, { confirmed: true }), code('FOCUS_ACTIVE'));
    assert.equal(f.writes.length, 0); assert.deepEqual(f.raw[Focus.KEY], state);
    await f.store.restore(await f.store.review(await source(), ['scratchpad']), { confirmed: true });
    assert.deepEqual(f.raw[Focus.KEY], state);
});
test('Focus starting after review invalidates baseline without writes', async () => {
    const f = fixture({ [Focus.KEY]: Focus.initial() }), p = await f.store.review(await source());
    f.raw[Focus.KEY].session = { id: 'active_session', phase: 'focus', status: 'running', remainingMs: 1500000, startedAt: 1, deadline: 1500001 }; f.raw[Focus.KEY].revision++;
    await assert.rejects(f.store.restore(p, { confirmed: true }), code('CONFLICT')); assert.equal(f.writes.length, 0);
});
test('oversized recovery is rejected before hashing', async () => {
    const f = fixture({ [Backup.RECOVERY_KEY]: { source: 'x'.repeat(Backup.LIMITS.bytes + 1), checksum: 'a'.repeat(64) } });
    f.manager.fingerprint = () => { throw Error('must not hash'); };
    await assert.rejects(f.store.recovery(), code('RECOVERY'));
});

test('backup-specific budget accepts 11 MiB image without weakening bookmark budget', async () => {
    const raw = { bg: { type: 'image', value: 'data:image/png;base64,' + 'A'.repeat(11 * 1024 * 1024) } };
    const f = fixture(raw), text = await f.store.export(['config']);
    assert.throws(() => f.manager.copyBookmarkImportValue(raw));
    const p = await f.store.review(text); assert.equal(p.incoming.config.hasBackgroundImage, true);
});

test('current schema/layout contradiction fails closed', async () => {
    const f = fixture({ schemaVersion: 2 }); await assert.rejects(f.store.export(), code('CORRUPT'));
    assert.equal(f.writes.length, 0);
});

test('structural read protection rejects cycles, getters and class instances without executing getter', async () => {
    const f = fixture(); let getterCalls = 0;
    const cyclic = {}; cyclic.quote = cyclic;
    const getter = {}; Object.defineProperty(getter, 'quote', { enumerable: true, get() { getterCalls++; throw Error('unsafe getter'); } });
    class Unsafe { constructor() { this.quote = 'text'; } }
    for (const raw of [cyclic, getter, new Unsafe()]) {
        f.backend.read = async () => raw; await assert.rejects(f.store.export(), code('CORRUPT'));
    }
    assert.equal(getterCalls, 0); assert.equal(f.writes.length, 0);
});

test('selection is captured before asynchronous lock wait', async () => {
    const f = fixture(); let release; const gate = new Promise(resolve => { release = resolve; });
    const blocker = f.locks.request(Tasks.LOCK, () => gate);
    const selected = ['scratchpad'], pending = f.store.review(await source(), selected);
    selected.push('config'); release(); await blocker;
    const p = await pending; assert.deepEqual(p.selected, ['scratchpad']);
    await f.store.restore(p, { confirmed: true }); assert.deepEqual(Object.keys(f.writes[1]), [Scratchpad.KEY]);
});

test('selection changes reuse privately parsed source but still refresh authoritative baseline', async () => {
    const f = fixture(), text = await source(); let validates = 0;
    const validate = f.manager.validateCompleteBackupConfig.bind(f.manager);
    f.manager.validateCompleteBackupConfig = value => { validates++; return validate(value); };
    await f.store.review(text, ['tasks']); const first = validates;
    f.raw.quote = 'Changed between reviews';
    const second = await f.store.review(text, ['scratchpad']);
    assert.equal(validates - first, 1, 'Only current stored config is validated; incoming parsed file is reused');
    await f.store.restore(second, { confirmed: true });
    assert.equal(JSON.parse(await f.store.recovery()).modules.config.data.quote, 'Changed between reviews');
});

test('cancellation during final awaited baseline read is checked immediately before target set', async () => {
    const f = fixture(), p = await f.store.review(await source()); let current = true;
    f.hooks.set = (values, raw) => {
        Object.assign(raw, copy(values));
        f.hooks.read = (keys, state) => {
            if (!keys.includes(Backup.RECOVERY_KEY)) current = false;
            return Object.fromEntries(keys.filter(key => Object.hasOwn(state, key)).map(key => [key, copy(state[key])]));
        };
    };
    await assert.rejects(f.store.restore(p, { confirmed: true, isCurrent: () => current }), code('CANCELLED'));
    assert.equal(f.writes.length, 1); assert(!Object.hasOwn(f.raw, Scratchpad.KEY));
});

for (const [name, raw, checkValue] of [
    ['clock missing worldClocks', { clock: { hour12: true, showSeconds: false } }, data => assert.deepEqual(data.clock, { hour12: true, showSeconds: false, worldClocks: [] })],
    ['UI missing finder preference', { ui: { showShortcutTitles: false } }, data => { assert.equal(data.ui.finderShortcutEnabled, true); assert.equal(data.ui.showShortcutTitles, false); }],
    ['partial shortcut style', { ui: { shortcutsStyle: { gapX: 20 } } }, data => { assert.equal(data.ui.shortcutsStyle.gapX, 20); assert.equal(data.ui.shortcutsStyle.gapY, null); }],
    ['layout missing grid fields', { layout: { autoArrange: false, alignToGrid: true, positions: { retained: { x: 4, y: 5 } } } }, data => { assert.equal(data.layout.gridSize, 96); assert.equal(data.layout.columns, 6); assert.deepEqual(data.layout.positions.retained, { x: 4, y: 5 }); }],
    ['numeric padding', { ui: { dashboardPadding: 20 } }, data => assert.deepEqual(data.ui.dashboardPadding, { top: 20, right: 20, bottom: 20, left: 20 })],
    ['partial side padding', { ui: { dashboardPadding: { top: 20 } } }, data => assert.deepEqual(data.ui.dashboardPadding, { top: 20, right: null, bottom: null, left: null })],
    ['partial other setting dictionaries', { show: { weather: true }, privacy: {}, movie: { title: 'Saved' }, hot: { tab: 'weibo' } }, data => { assert.equal(data.show.weather, true); assert.equal(data.show.clock, true); assert.equal(data.privacy.onlineFavicons, false); assert.equal(data.movie.title, 'Saved'); assert.deepEqual(data.hot.weibo, []); }]
]) test(`supported stored legacy ${name} exports and enters recovery without changing saved settings`, async () => {
    const f = fixture(raw), before = copy(f.raw), text = await f.store.export();
    checkValue(JSON.parse(text).modules.config.data); assert.deepEqual(f.raw, before); assert.equal(f.writes.length, 0);
    await f.store.restore(await f.store.review(await source(), ['scratchpad']), { confirmed: true });
    checkValue(JSON.parse(await f.store.recovery()).modules.config.data);
    for (const [key, value] of Object.entries(before)) assert.deepEqual(f.raw[key], value);
});

for (const raw of [
    { clock: { hour12: 'true' } }, { clock: { worldClocks: {} } }, { ui: { finderShortcutEnabled: 'false' } },
    { layout: { columns: 999 } }, { layout: { positions: { bad: { x: '4', y: 5 } } } },
    { ui: { dashboardPadding: -1 } }, { ui: { dashboardPadding: 999 } }, { ui: { dashboardPadding: NaN } },
    { ui: { dashboardPadding: 20.5 } }, { ui: { dashboardPadding: { top: '20' } } },
    { clock: { unknown: true } }, { ui: { shortcutsStyle: { mystery: 2 } } }, { show: [] }, { hot: { baidu: {} } }
]) test(`legacy normalization does not repair supplied malformed state: ${JSON.stringify(raw)}`, async () => {
    const f = fixture(raw); await assert.rejects(f.store.export(), code('CORRUPT')); assert.equal(f.writes.length, 0);
});

test('legacy omission and numeric-padding normalization is forbidden in imported portable archives', async () => {
    for (const mutate of [file => { delete file.modules.config.data.clock.worldClocks; }, file => { delete file.modules.config.data.ui.finderShortcutEnabled; }, file => { delete file.modules.config.data.layout.gridSize; }, file => { file.modules.config.data.ui.dashboardPadding = 20; }]) {
        const f = fixture(), file = JSON.parse(await source()); mutate(file);
        assert.throws(() => f.store.review(JSON.stringify(file))); assert.equal(f.writes.length, 0);
    }
});

test('selected small export ignores oversized unselected configuration; full recovery still fails closed', async () => {
    const f = fixture({ quote: 'q'.repeat(Backup.LIMITS.bytes), [Scratchpad.KEY]: { ...Scratchpad.initial(), content: 'small' } });
    const reads = [];
    f.hooks.read = (keys, raw) => { reads.push([...keys]); return Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, copy(raw[key])])); };
    const text = await f.store.export(['scratchpad']);
    assert.deepEqual(reads, [[Scratchpad.KEY]]);
    assert.equal(Backup.parse(text, f.manager).modules.scratchpad.content, 'small');
    assert.equal(Buffer.byteLength(text) < 256, true); assert.equal(f.writes.length, 0);
    await assert.rejects(f.store.export());
    await assert.rejects(f.store.review(text, ['scratchpad']));
    assert.equal(f.writes.length, 0);
});

test('selected export never reads unselected personal keys, providers, credentials or update state', async () => {
    const f = fixture(populated()), reads = [];
    for (const key of [Tasks.KEY, Focus.KEY, Countdown.KEY, 'sync', f.manager.syncIdentityStateKey, '__auth', '__updatePreferences']) {
        Object.defineProperty(f.raw, key, { enumerable: true, get() { throw Error('Unselected key read: ' + key); } });
    }
    f.hooks.read = (keys, raw) => { reads.push([...keys]); return Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, copy(raw[key])])); };
    const text = await f.store.export(['scratchpad', 'config']);
    assert.deepEqual(Object.keys(JSON.parse(text).modules), ['config', 'scratchpad']);
    assert(reads[0].includes(f.manager.layoutGenerationKey)); assert(reads[0].includes(f.manager.settingsGenerationKey)); assert(reads[0].includes('schemaVersion'));
    assert(!reads[0].includes('sync')); assert.equal(f.writes.length, 0);
});

for (const [name, key, invalid] of [['tasks', Tasks.KEY, { schemaVersion: 99 }], ['scratchpad', Scratchpad.KEY, { ...Scratchpad.initial(), content: 7 }], ['countdown', Countdown.KEY, null], ['focus', Focus.KEY, {}]]) test(`selected ${name} corruption still blocks export without writes`, async () => {
    const f = fixture({ [key]: invalid }); await assert.rejects(f.store.export([name]), code('CORRUPT')); assert.equal(f.writes.length, 0);
});

test('selected config retains schema and generation validation while small unrelated exports remain possible', async () => {
    for (const raw of [{ schemaVersion: 99 }, { __localItabLayoutGeneration: 42 }, { __localItabSettingsGeneration: null }]) {
        const f = fixture(raw); await assert.rejects(f.store.export(['config']), code('CORRUPT'));
        assert.deepEqual(Object.keys(JSON.parse(await f.store.export(['scratchpad'])).modules), ['scratchpad']); assert.equal(f.writes.length, 0);
    }
});

test('partial export filters unexpected extra backend fields before validating byte budget', async () => {
    const f = fixture(); const raw = { [Scratchpad.KEY]: Scratchpad.initial() };
    Object.defineProperty(raw, 'quote', { enumerable: true, get() { throw Error('Unexpected unselected getter'); } });
    f.backend.read = async () => raw;
    assert.deepEqual(Object.keys(JSON.parse(await f.store.export(['scratchpad'])).modules), ['scratchpad']);
    assert.equal(f.writes.length, 0);
});

test('selected key accessors and hidden properties reject before a missing-state fallback without executing getters', async () => {
    for (const descriptor of [{ enumerable: true, get() { throw Error('Getter was invoked'); } }, { enumerable: false, value: Scratchpad.initial() }]) {
        const f = fixture(), raw = {}; Object.defineProperty(raw, Scratchpad.KEY, descriptor); f.backend.read = async () => raw;
        await assert.rejects(f.store.export(['scratchpad']), code('CORRUPT')); assert.equal(f.writes.length, 0);
    }
});

test('selected export works when individually valid unselected config pushes only the full envelope over limit', async () => {
    const raw = { quote: 'x'.repeat(Backup.LIMITS.bytes - 500), [Scratchpad.KEY]: { ...Scratchpad.initial(), enabled: true, content: 'Small saved note' } };
    const f = fixture(raw);
    f.manager.completeBackupConfigFromRaw(raw); Scratchpad.validate(raw[Scratchpad.KEY]);
    const text = await f.store.export(['scratchpad']);
    assert.equal(Buffer.byteLength(text), 186); assert.equal(Backup.parse(text, f.manager).modules.scratchpad.content, 'Small saved note');
    await assert.rejects(f.store.export(), code('SIZE_LIMIT')); await assert.rejects(f.store.review(text), code('SIZE_LIMIT')); assert.equal(f.writes.length, 0);
});

test('stored legacy sites and categories with absent optional fields export/recover without modifying originals', async () => {
    const raw = { links: [{title:'Original site',url:'https://example.com/'}], categories: [{id:'work',name:'Work'}] };
    const f = fixture(raw), before = copy(f.raw), exported = JSON.parse(await f.store.export());
    assert.deepEqual(exported.modules.config.data.links, [{icon:'🌐',category:'work',title:'Original site',url:'https://example.com/'}]);
    assert.deepEqual(exported.modules.config.data.categories, [{icon:'📁',id:'work',name:'Work'}]);
    assert.deepEqual(f.raw, before); assert.equal(f.writes.length, 0);
    await f.store.restore(await f.store.review(await source(), ['scratchpad']), {confirmed:true});
    assert.deepEqual(JSON.parse(await f.store.recovery()).modules.config.data.links, exported.modules.config.data.links);
    assert.deepEqual(f.raw.links, before.links); assert.deepEqual(f.raw.categories, before.categories);
});

for (const raw of [
    {links:[{title:'Site',url:'https://example.com/',icon:42}]},
    {links:[{title:'Site',url:'https://example.com/',category:null}]},
    {links:[{title:'Site',url:'https://example.com/',unexpected:true}]},
    {categories:[{id:'work',name:'Work',icon:42}]},
    {categories:[{id:'work',name:'Work',unexpected:true}]}
]) test('legacy cosmetic defaults never repair malformed supplied values or unknown fields: '+JSON.stringify(raw), async () => {
    const f=fixture(raw); await assert.rejects(f.store.export(), code('CORRUPT')); assert.equal(f.writes.length,0);
});

test('imported portable archives still require optional cosmetics explicitly present', async () => {
    for (const mutate of [file=>{delete file.modules.config.data.links[0].icon;},file=>{delete file.modules.config.data.links[0].category;},file=>{delete file.modules.config.data.categories[0].icon;}]) {
        const f=fixture(),file=JSON.parse(await source());mutate(file);assert.throws(()=>f.store.review(JSON.stringify(file)));assert.equal(f.writes.length,0);
    }
});
