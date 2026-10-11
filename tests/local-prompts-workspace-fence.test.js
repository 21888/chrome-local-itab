const assert = require('node:assert/strict');
const test = require('node:test');
const Prompts = require('../shared/local-prompts-store.js');
const Workspaces = require('../shared/workspaces.js');
function fixture(marker) {
    const chrome = { storage: { local: { async get() { return marker === undefined ? {} : { [Workspaces.RESTORE_TRANSACTION_KEY]: marker }; } },
        onChanged: { addListener() {}, removeListener() {} } } };
    const locks = { request(name, options, action) { return action(); } };
    const manager = new Workspaces.Manager({ chrome, locks });
    return { manager, store: new Prompts.Store(manager.createPromptBackend(Prompts)) };
}
test('prompt backend preserves established workspace pending code as a prompt-owned fault', async () => {
    for (const status of ['prepared', 'submitted']) {
        const { store } = fixture({ schemaVersion: 1, id: 'restore_identity', status });
        await assert.rejects(() => store.read(), error => error.code === 'WORKSPACE_RESTORE_PENDING' && error.message === 'Local prompts: WORKSPACE_RESTORE_PENDING');
    }
    for (const status of ['verified', 'recovered']) {
        const { store } = fixture({ schemaVersion: 1, id: 'restore_identity', status });
        assert.equal((await store.read()).records.length, 0);
    }
});
test('arbitrary pending-looking errors cannot cross the owned workspace boundary or invoke error getters', async () => {
    const { manager, store } = fixture(); let accessed = 0;
    manager.assertRestoreSettled = async () => { throw Object.defineProperty({}, 'code', { get() { accessed++; return 'WORKSPACE_RESTORE_PENDING'; } }); };
    await assert.rejects(() => store.read(), { code: 'LOCK' }); assert.equal(accessed, 0);
    manager.assertRestoreSettled = async () => { throw Object.assign(Error('not owned'), { code: 'WORKSPACE_RESTORE_PENDING' }); };
    await assert.rejects(() => store.read(), { code: 'LOCK' });
});
