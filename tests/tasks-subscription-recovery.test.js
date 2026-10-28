const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument } = require('./helpers/task-dom-model');
const tasks = require('../shared/local-tasks-store');
const { Controller } = require('../shared/local-tasks-controller');
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

for (const locale of ['en', 'zh_CN']) test(`Tasks registration failure stays mounted and fresh instance can recover: ${locale}`, async t => {
    const initial = tasks.initial(); initial.enabled = true; initial.revision = 4;
    initial.records = [{ id: 'task_original', version: 'version_original', text: 'Saved task 中文 😀', state: 'done', removedFrom: null, createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z' }];
    initial.receipts = ['receipt_original'];
    initial.recovery = [{ id: 'recovery_original', createdAt: '2026-10-10T00:00:00.000Z', content: { records: [], pinnedId: null } }];
    tasks.validate(initial);
    let raw = structuredClone(initial), fail = true, reads = 0, writes = 0, registrations = 0;
    const listeners = new Set(); let queue = Promise.resolve();
    const chrome = { storage: { local: {
        async get() { reads++; return { [tasks.KEY]: structuredClone(raw) }; },
        async set(values) { writes++; const oldValue = raw; raw = structuredClone(values[tasks.KEY]); for (const fn of listeners) fn({ [tasks.KEY]: { oldValue, newValue: raw } }, 'local'); }
    }, onChanged: {
        addListener(fn) { registrations++; if (fail) throw Error('synthetic event registration failure'); listeners.add(fn); },
        removeListener(fn) { listeners.delete(fn); }
    } } };
    const locks = { request(name, options, fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; } };
    const document = createDocument(), messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, i18n: { t: key => messages[key]?.message || key } };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob });
    for (const file of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(`shared/${file}`, 'utf8'), context);
    const mount = settings => {
        const host = document.createElement('article'); document.body.append(host);
        const controller = new Controller(new tasks.Store(tasks.createChromeBackend(chrome, locks, null)));
        t.after(() => controller.destroy());
        const view = settings ? api.mountSettings(host, { controller }) : api.mount(host, { controller });
        return { host, controller, view };
    };
    const broken = mount(false), settings = mount(true); await settle();
    assert.equal(broken.controller.status, 'error');
    assert.equal(broken.view.status.textContent, messages.tasksSubscriptionError.message);
    assert.equal(broken.host.hidden, false); assert.equal(broken.view.input.disabled, true); assert.equal(broken.view.retry.hidden, true);
    assert.equal(settings.host.querySelector('[role="status"]').textContent, messages.tasksSubscriptionError.message);
    assert.equal(settings.host.querySelector('input').disabled, true); assert.equal(settings.host.querySelector('button').hidden, true);
    assert.equal(broken.view.exportButton.disabled, true); assert.equal(broken.view.importButton.disabled, true);
    broken.view.fileInput.files = [{ size: 1, text() { throw Error('must not read a file'); } }];
    await broken.view.export(); await broken.view.importFile(); await broken.view.reviewRecovery('recovery_original');
    assert.equal(reads, 0); assert.equal(writes, 0); assert.deepEqual(raw, initial);
    fail = false;
    for (const { controller } of [broken, settings]) {
        await assert.rejects(controller.refresh(), { code: 'SUBSCRIPTION' });
        await assert.rejects(controller.retry(), { code: 'SUBSCRIPTION' });
        await assert.rejects(controller.action('add', { text: 'must not save' }), { code: 'SUBSCRIPTION' });
        await assert.rejects(controller.run(controller.store.request('add', { text: 'must not save either' })), { code: 'SUBSCRIPTION' });
        controller.dismissRetry(undefined);
        assert.equal(controller.error.code, 'SUBSCRIPTION'); assert.equal(controller.status, 'error');
    }
    assert.equal(registrations, 2); assert.equal(reads, 0); assert.equal(writes, 0);
    const fresh = mount(false); await settle(); assert.equal(fresh.controller.status, 'ready');
    assert.equal(fresh.view.input.disabled, false); assert.deepEqual(raw, initial);
    await fresh.controller.action('add', { text: 'Explicit new task 中文' }); await settle();
    assert.equal(writes, 1); assert.equal(raw.records.length, 2); assert.equal(raw.records.at(-1).text, 'Explicit new task 中文');
    assert.deepEqual(raw.records[0], initial.records[0]); assert.deepEqual(raw.recovery, initial.recovery);
    assert.equal(fresh.controller.status, 'saved');
});
