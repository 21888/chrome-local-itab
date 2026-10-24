const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); };
for (const locale of ['en', 'zh_CN']) test(`Scratchpad subscription failure and fresh-instance recovery: ${locale}`, async t => {
    const initial = { schemaVersion: 1, revision: 4, enabled: true, content: 'Saved 中文 😀\nexact note' };
    let raw = structuredClone(initial), fail = true, reads = 0, writes = 0, registrations = 0, tail = Promise.resolve();
    const listeners = new Set();
    const backend = {
        lock(fn) { const next = tail.then(fn); tail = next.catch(() => {}); return next; },
        async read() { reads++; return structuredClone(raw); },
        async write(value) { writes++; raw = structuredClone(value); listeners.forEach(fn => fn()); },
        subscribe(fn) { registrations++; if (fail) throw Error('synthetic registration failure'); listeners.add(fn); return () => listeners.delete(fn); }
    };
    const document = createDocument(), messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const window = { LocalItabScratchpad: { ...api, Controller }, i18n: { t: key => messages[key]?.message || key }, addEventListener() {}, removeEventListener() {} };
    vm.runInNewContext(fs.readFileSync('shared/local-scratchpad-view.js', 'utf8'), { window, document });
    const mount = (settings = false) => {
        const host = document.createElement('section'); document.body.append(host);
        const controller = new Controller(new api.Store(backend), { delay: 5 });
        const view = settings ? window.LocalItabScratchpad.mountSettings(host, { controller }) : new window.LocalItabScratchpad.View(host, { controller });
        t.after(() => view.destroy()); return { host, controller, view };
    };
    const broken = mount(), settings = mount(true); await settle();
    assert.equal(broken.controller.status, 'error');
    assert.equal(broken.view.status.textContent, messages.scratchpadSubscriptionError.message);
    assert(broken.view.textarea.readOnly); assert(broken.view.retry.hidden);
    assert.equal(settings.host.querySelector('.scratchpad-status').textContent, messages.scratchpadSubscriptionError.message);
    assert(settings.host.querySelector('button').hidden);
    assert(settings.host.querySelector('input').disabled);
    assert.equal(reads, 0); assert.equal(writes, 0); assert.deepEqual(raw, initial);
    fail = false;
    for (const { controller } of [broken, settings]) {
        await assert.rejects(controller.retry(), { code: 'SUBSCRIPTION' });
        await assert.rejects(controller.refresh(), { code: 'SUBSCRIPTION' });
        await assert.rejects(controller.run('content', 'must not save', 4), { code: 'SUBSCRIPTION' });
    }
    assert.equal(registrations, 2); assert.equal(reads, 0); assert.equal(writes, 0);
    const fresh = mount(); await settle();
    assert.equal(fresh.view.textarea.value, initial.content); assert(!fresh.view.textarea.readOnly);
    assert.deepEqual(raw, initial); assert.equal(writes, 0);
    fresh.view.textarea.value = 'Explicit new edit'; fresh.view.textarea.dispatch('input');
    await new Promise(r => setTimeout(r, 30)); await settle();
    assert.equal(raw.content, 'Explicit new edit'); assert.equal(raw.revision, 5); assert.equal(writes, 1);
    assert.equal(fresh.controller.status, 'saved');
});
