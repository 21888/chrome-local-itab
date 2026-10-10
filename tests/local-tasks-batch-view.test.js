const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const tasks = require('../shared/local-tasks-store');
const { Controller } = require('../shared/local-tasks-controller');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
function model(locale = 'en', alwaysVisible = true, blurUnavailableFocus = false) {
    let raw, queue = Promise.resolve(); const listeners = new Set(), events = new Map();
    const backend = {
        writes: 0, notifications: true, delay: null, fail: false, failRead: false, failAfter: false, failVerify: false, drop: false,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { if (backend.failRead || backend.readOnce) { backend.readOnce = false; throw Error('Unavailable'); } return raw && structuredClone(raw); },
        async write(value) {
            backend.writes++; if (backend.delay) await backend.delay;
            if (backend.fail) return false; if (backend.drop) return;
            raw = structuredClone(value); if (backend.notifications) listeners.forEach(fn => fn());
            if (backend.failAfter) { backend.failAfter = false; throw Error('Uncertain acknowledgement'); }
            if (backend.failVerify) { backend.failVerify = false; backend.readOnce = true; }
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw: () => raw && structuredClone(raw), seed: value => { raw = structuredClone(value); }
    };
    const store = new tasks.Store(backend), remote = new tasks.Store(backend), controller = new Controller(store);
    const document = createDocument({ blurUnavailableFocus }), host = document.createElement('article'), search = document.createElement('input'); document.body.append(search, host); search.focus();
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, i18n: { t: key => catalog[key]?.message || key },
        addEventListener(type, fn) { events.set(type, fn); } };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console });
    for (const file of ['dialog-focus', 'local-tasks-view', 'local-content-lifecycle']) vm.runInContext(fs.readFileSync(`shared/${file}.js`, 'utf8'), context);
    const view = api.mount(host, { controller, alwaysVisible }); window.localTasksView = view;
    return { backend, store, remote, controller, document, host, search, view,
        t: key => catalog[key]?.message || key,
        guarded() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; events.get('beforeunload')(event); return event.prevented; }
    };
}
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const modal = h => h.document.querySelector('.tasks-dialog');
const editor = h => h.document.querySelector('.tasks-batch-editor');
const byText = (h, key) => modal(h).querySelectorAll('button').find(node => node.textContent.startsWith(h.t(key)));
const click = (h, key, event = {}) => { const node = byText(h, key); assert(node, key); node.dispatch('click', event); return node; };
const feedback = h => modal(h).querySelector('.tasks-dialog-feedback').textContent;
const preview = h => modal(h).querySelector('.tasks-batch-preview');
async function open(h, text = 'one\ntwo') { h.view.batchButton.focus(); h.view.batchButton.dispatch('click'); input(editor(h), text); }
async function review(h) { click(h, 'tasksBatchReview'); await settle(); }
async function add(store, text) { return (await store.mutate(store.request('add', { text }))).records.at(-1); }

for (const locale of ['en', 'zh_CN']) test(`batch view ${locale}: explicit numbered review, exact text, cancel and one atomic confirm`, async () => {
    const h = model(locale); await settle(); const before = h.backend.raw();
    input(h.view.input, 'ordinary draft\nwith a newline'); input(h.view.filterInput, 'filter preserved');
    assert.equal(h.view.batchButton.tagName, 'BUTTON'); assert.equal(h.view.batchButton.type, 'button');
    await open(h, '  - keep spaces  \r\n\n中文 😀\r* literal\nsame\nsame\n<b>plain</b>');
    assert.equal(editor(h).getAttribute('aria-label'), h.t('tasksBatchLabel')); assert(editor(h).getAttribute('aria-describedby'));
    assert.equal(modal(h).getAttribute('role'), 'dialog'); assert.equal(modal(h).getAttribute('aria-modal'), 'true');
    assert.equal(h.guarded(), true); await review(h);
    assert.equal(h.backend.writes, 0); assert.deepEqual(h.backend.raw(), before);
    assert.equal(preview(h).hidden, false); const list = preview(h).querySelector('ol');
    assert.equal(list.tagName, 'OL'); assert.deepEqual(list.children.map(node => node.textContent), ['  - keep spaces  ', '中文 😀', '* literal', 'same', 'same', '<b>plain</b>']);
    assert(list.children.every(node => node.children.length === 0));
    assert.match(byText(h, 'tasksBatchConfirm').textContent, /\(6\)/);
    assert.match(modal(h).querySelectorAll('.tasks-help').at(-1).textContent, /6.*0\/500.*500/);
    click(h, 'tasksCancel'); assert.equal(h.backend.writes, 0); assert.equal(modal(h), null);
    await open(h, 'first\nfirst'); await review(h); const confirm = click(h, 'tasksBatchConfirm');
    confirm.dispatch('click'); confirm.dispatch('click', { detail: 2 }); await settle();
    assert.equal(h.backend.writes, 1); assert.deepEqual(h.backend.raw().records.map(t => t.text), ['first', 'first']);
    assert.equal(modal(h), null); assert.equal(h.view.input.value, 'ordinary draft\nwith a newline'); assert.equal(h.view.filterInput.value, 'filter preserved');
    assert.equal(h.document.activeElement, h.view.batchButton); h.view.destroy();
});

test('batch view leaves ordinary Add and Shift+Enter multiline semantics intact', async () => {
    const h = model(); await settle(); input(h.view.input, 'one\ntwo');
    const enter = h.view.input.dispatch('keydown', { key: 'Enter', shiftKey: true }); assert.equal(enter.prevented, false); await settle(); assert.equal(h.backend.writes, 0);
    h.view.input.dispatch('keydown', { key: 'Enter' }); await settle(); assert.equal(h.backend.raw().records.length, 1); assert.equal(h.backend.raw().records[0].text, 'one\ntwo');
    await open(h); editor(h).dispatch('keydown', { key: 'Enter' }); editor(h).dispatch('keydown', { key: 'Enter', shiftKey: true }); await settle(); assert.equal(h.backend.writes, 1);
    h.view.destroy();
});

test('batch view validates empty, control, Unicode length and capacity before allowing confirmation', async () => {
    const h = model(); await settle(); await open(h);
    for (const source of [' \n\t\r\n', 'valid\n\u0000invalid', '😀'.repeat(1001), Array(501).fill('line').join('\n')]) {
        input(editor(h), source); await review(h); assert.equal(byText(h, 'tasksBatchConfirm').hidden, true); assert(feedback(h)); assert.equal(h.backend.writes, 0);
    }
    input(editor(h), '😀'.repeat(1000)); await review(h); assert.equal(byText(h, 'tasksBatchConfirm').hidden, false); assert.equal(h.backend.writes, 0); h.view.destroy();
});

for (const mode of ['edit', 'close', 'reopen', 'destroy', 'newer-review']) test(`batch review callbacks respect ${mode} ownership`, async () => {
    const h = model(); await settle(); await open(h, 'old'); const gate = deferred(), original = h.store.reviewBatch.bind(h.store);
    let first = true; h.store.reviewBatch = async source => { const value = await original(source); if (first) { first = false; await gate.promise; } return value; };
    click(h, 'tasksBatchReview'); await tick();
    if (mode === 'edit' || mode === 'newer-review') input(editor(h), 'new draft');
    if (mode === 'newer-review') await review(h);
    if (mode === 'close' || mode === 'reopen') click(h, 'tasksCancel');
    if (mode === 'reopen') await open(h, 'reopened draft');
    if (mode === 'destroy') h.view.destroy();
    const current = editor(h), focus = h.document.activeElement; gate.resolve(); await settle();
    assert.equal(h.backend.writes, 0); assert.equal(editor(h), current); assert.equal(h.document.activeElement, focus);
    if (mode === 'edit' || mode === 'reopen') { assert.equal(preview(h).hidden, true); assert.equal(byText(h, 'tasksBatchConfirm').hidden, true); }
    if (mode === 'newer-review') assert.deepEqual(preview(h).querySelector('ol').children.map(node => node.textContent), ['new draft']);
    h.view.destroy();
});

test('observed remote changes invalidate idle and delayed previews but preserve both task drafts', async () => {
    const h = model(); await settle(); input(h.view.input, 'single draft'); await open(h); await review(h);
    const old = byText(h, 'tasksBatchConfirm'); await add(h.remote, 'remote'); await settle();
    assert.equal(old.hidden, true); assert.equal(preview(h).hidden, true); assert.equal(editor(h).value, 'one\ntwo'); assert.equal(h.view.input.value, 'single draft');
    old.dispatch('click'); await settle(); assert.equal(h.backend.raw().records.length, 1); assert.equal(feedback(h), h.t('tasksBatchChanged'));
    const gate = deferred(), original = h.store.reviewBatch.bind(h.store); h.store.reviewBatch = async source => { const value = await original(source); await gate.promise; return value; };
    click(h, 'tasksBatchReview'); await tick(); await add(h.remote, 'remote newer'); gate.resolve(); await settle();
    assert.equal(byText(h, 'tasksBatchConfirm').hidden, true); assert.equal(editor(h).value, 'one\ntwo'); assert.equal(feedback(h), h.t('tasksBatchChanged')); h.view.destroy();
});

test('a fresh review shows latest read capacity even when cross-tab notifications are absent', async () => {
    const h = model(); await settle(); h.backend.notifications = false; await add(h.remote, 'remote'); await open(h); await review(h);
    assert.match(modal(h).querySelectorAll('.tasks-help').at(-1).textContent, /2.*1\/500.*499/);
    click(h, 'tasksBatchConfirm'); await settle(); assert.deepEqual(h.backend.raw().records.map(t => t.text), ['remote', 'one', 'two']); h.view.destroy();
});

test('unobserved concurrent additions/pin/history survive; late capacity exhaustion writes no part of batch', async () => {
    const h = model(); await settle(); const pinned = await add(h.store, 'pinned'); await h.store.mutate(h.store.request('pin', { id: pinned.id, version: pinned.version, expectedPin: null })); await settle();
    await open(h); await review(h); h.backend.notifications = false; await add(h.remote, 'concurrent'); const before = h.backend.raw();
    click(h, 'tasksBatchConfirm'); await settle(); const after = h.backend.raw(); assert.deepEqual(after.records.slice(0, 2), before.records); assert.equal(after.pinnedId, pinned.id); assert.deepEqual(after.recovery, before.recovery);
    await open(h, 'too\nmany'); await review(h);
    const state = h.backend.raw(); state.records = Array.from({ length: 499 }, (_, i) => ({ ...state.records[0], id: `task_capacity_${i}`, version: `version_capacity_${i}` })); state.pinnedId = null; state.revision++; h.backend.seed(state);
    const writes = h.backend.writes; click(h, 'tasksBatchConfirm'); await settle(); assert.equal(h.backend.writes, writes); assert.deepEqual(h.backend.raw(), state); assert.equal(editor(h).value, 'too\nmany'); assert.equal(byText(h, 'tasksBatchConfirm').hidden, true); h.view.destroy();
});

for (const failure of ['write', 'uncertain', 'read-back', 'verify', 'read-before']) test(`batch ${failure} error keeps immutable retry and newer draft, without duplicates`, async () => {
    const h = model(); await settle(); await open(h); await review(h); const gate = deferred(); h.backend.delay = gate.promise;
    if (failure === 'write') h.backend.fail = true;
    if (failure === 'uncertain') h.backend.failAfter = true;
    if (failure === 'read-back') h.backend.failVerify = true;
    if (failure === 'verify') h.backend.drop = true;
    if (failure === 'read-before') h.backend.failRead = true;
    const confirm = click(h, 'tasksBatchConfirm'); input(editor(h), 'new current draft'); confirm.dispatch('click');
    gate.resolve(); await settle(); assert.equal(editor(h).value, 'new current draft'); assert.equal(h.guarded(), true);
    const command = h.controller.retryCommand; assert(command); assert.equal(command.kind, 'addBatch'); assert.deepEqual([...command.texts], ['one', 'two']);
    assert.equal(byText(h, 'tasksBatchRetry').hidden, false); assert.equal(byText(h, 'tasksBatchReview').disabled, true); assert.equal(byText(h, 'tasksBatchConfirm').hidden, true);
    assert.deepEqual(preview(h).querySelector('ol').children.map(node => node.textContent), ['one', 'two']);
    const writes = h.backend.writes; click(h, 'tasksBatchReview'); await settle(); assert.equal(h.backend.writes, writes);
    h.backend.delay = null; h.backend.fail = h.backend.drop = h.backend.failRead = false;
    const retry = click(h, 'tasksBatchRetry'); retry.dispatch('click'); retry.dispatch('click', { detail: 2 }); await settle();
    assert.deepEqual(h.backend.raw().records.map(t => t.text), ['one', 'two']); assert.equal(editor(h).value, 'new current draft'); assert.equal(h.controller.retryCommand, null);
    assert.equal(preview(h).hidden, true); assert.equal(byText(h, 'tasksBatchRetry').hidden, true); assert.equal(feedback(h), h.t('tasksBatchDraftRemains'));
    await review(h); click(h, 'tasksBatchConfirm'); await settle(); assert.deepEqual(h.backend.raw().records.map(t => t.text), ['one', 'two', 'new current draft']); assert.equal(modal(h), null); h.view.destroy();
});

test('old acknowledged batch after a later mutation requires a new explicit review', async () => {
    const h = model(); await settle(); await open(h); await review(h); h.backend.failAfter = true; click(h, 'tasksBatchConfirm'); await settle();
    const command = h.controller.retryCommand; await add(h.remote, 'later'); await settle(); const before = h.backend.raw(), writes = h.backend.writes;
    click(h, 'tasksBatchRetry'); await settle(); assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, writes); assert.equal(editor(h).value, 'one\ntwo');
    assert.equal(byText(h, 'tasksBatchRetry').hidden, true); assert.equal(byText(h, 'tasksBatchConfirm').hidden, true); assert.equal(feedback(h), h.t('tasksConflict'));
    await review(h); assert.equal(byText(h, 'tasksBatchConfirm').hidden, false); assert.notEqual(h.controller.retryCommand?.operationId, command.operationId); assert.equal(h.backend.writes, writes); h.view.destroy();
});

for (const changed of [true, false]) test(`confirmed batch ${changed ? 'retains later edits, even edited back' : 'closes unchanged draft'}`, async () => {
    const h = model(); await settle(); await open(h); await review(h); const gate = deferred(); h.backend.delay = gate.promise; click(h, 'tasksBatchConfirm');
    if (changed) { input(editor(h), 'new text'); input(editor(h), 'one\ntwo'); editor(h).focus(); }
    gate.resolve(); await settle(); assert.deepEqual(h.backend.raw().records.map(t => t.text), ['one', 'two']);
    if (changed) { assert.equal(editor(h).value, 'one\ntwo'); assert.equal(h.document.activeElement, editor(h)); assert.equal(preview(h).hidden, true); }
    else assert.equal(modal(h), null);
    h.view.destroy();
});

for (const mode of ['success', 'failure', 'destroy']) test(`closed pending batch ${mode} cannot alter a reopened dialog or its focus`, async () => {
    const h = model(); await settle(); await open(h); await review(h); const oldInput = editor(h), oldConfirm = byText(h, 'tasksBatchConfirm'), gate = deferred();
    h.backend.delay = gate.promise; h.backend.fail = mode === 'failure'; click(h, 'tasksBatchConfirm');
    click(h, 'tasksCancel'); assert.equal(h.guarded(), true, 'pending save remains guarded after closing');
    if (mode === 'destroy') h.view.destroy(); else { h.view.addBatch(); input(editor(h), 'reopened draft'); }
    const current = editor(h), focus = h.document.activeElement; gate.resolve(); await settle();
    oldConfirm.dispatch('click'); input(oldInput, 'detached change'); await settle();
    assert.equal(editor(h), current); assert.equal(h.document.activeElement, focus); assert.equal(h.controller.retryCommand, mode === 'destroy' ? h.controller.retryCommand : null);
    if (mode !== 'destroy') { assert.equal(current.value, 'reopened draft'); assert.equal(preview(h).hidden, true); }
    assert.equal(h.backend.writes, 1); h.view.destroy();
});

for (const protection of ['flag', '229', 'lifecycle']) test(`batch dialog ${protection} IME Escape and focus trapping use shared helper`, async () => {
    const h = model(); await settle(); await open(h, '中文草稿'); const field = editor(h);
    if (protection === 'lifecycle') field.dispatch('compositionstart');
    const event = field.dispatch('keydown', { key: 'Escape', ...(protection === 'flag' ? { isComposing: true } : protection === '229' ? { keyCode: 229 } : {}) });
    assert.equal(event.prevented, false); assert.equal(event.stopped, true); assert.equal(editor(h), field); assert.equal(h.guarded(), true);
    if (protection === 'lifecycle') { click(h, 'tasksBatchReview'); await settle(); assert.equal(preview(h).hidden, true); field.dispatch('compositionend'); }
    await review(h); const confirm = byText(h, 'tasksBatchConfirm'); confirm.focus(); const tab = confirm.dispatch('keydown', { key: 'Tab' }); assert(tab.prevented); assert.equal(h.document.activeElement, field);
    const repeated = confirm.dispatch('keydown', { key: ' ', repeat: true }); assert(repeated.prevented);
    field.dispatch('keydown', { key: 'Escape' }); assert.equal(modal(h), null); assert.equal(h.guarded(), false); assert.equal(h.document.activeElement, h.view.batchButton); assert.equal(h.backend.writes, 0); h.view.destroy();
});

test('batch dialog survives remote hiding without changing the preference; close honors it', async () => {
    const h = model('en', false); await h.controller.action('enable', { enabled: true }); await settle(); await open(h);
    await h.remote.mutate(h.remote.request('enable', { enabled: false })); await settle();
    assert.equal(h.host.hidden, false); assert.equal(editor(h).value, 'one\ntwo'); const writes = h.backend.writes;
    await review(h); click(h, 'tasksCancel');
    assert.equal(h.host.hidden, true); assert.equal(h.backend.writes, writes); assert.equal(h.backend.raw().enabled, false); assert.equal(h.guarded(), false); h.view.destroy();
});

test('lost IME composition end on blur does not strand review controls', async () => {
    const h = model(); await settle(); await open(h); editor(h).dispatch('compositionstart');
    assert.equal(byText(h, 'tasksBatchReview').disabled, true); editor(h).dispatch('focusout');
    assert.equal(byText(h, 'tasksBatchReview').disabled, false); await review(h); assert.equal(preview(h).hidden, false); h.view.destroy();
});

test('batch result cannot close its editor after a newer controller mutation begins', async () => {
    const h = model(); await settle(); await open(h); await review(h); const gate = deferred(); let newer;
    const off = h.controller.subscribe(() => {
        if (h.controller.status === 'saved' && !h.controller.pending) {
            off(); h.backend.delay = gate.promise; newer = h.controller.action('add', { text: 'newer separate action' });
        }
    });
    click(h, 'tasksBatchConfirm'); await settle();
    assert.equal(editor(h).value, 'one\ntwo'); assert.equal(preview(h).hidden, true); assert(h.controller.pending);
    gate.resolve(); await newer; await settle(); assert.equal(editor(h).value, 'one\ntwo'); assert.deepEqual(h.backend.raw().records.map(t => t.text), ['one', 'two', 'newer separate action']); h.view.destroy();
});

test('review read failures are read-only, preserve source, and permit another explicit review', async () => {
    const h = model(); await settle(); await open(h); h.backend.failRead = true; await review(h);
    assert.equal(h.backend.writes, 0); assert.equal(editor(h).value, 'one\ntwo'); assert.equal(byText(h, 'tasksBatchConfirm').hidden, true); assert.equal(feedback(h), h.t('tasksErrorRead'));
    h.backend.failRead = false; await review(h); assert.equal(byText(h, 'tasksBatchConfirm').hidden, false); assert.equal(h.backend.writes, 0); h.view.destroy();
});

test('batch feedback keeps review-ready, saving and saved-new-draft statuses neutral', async () => {
    const h = model(); await settle(); await open(h); const node = modal(h).querySelector('.tasks-batch-feedback');
    assert(node); assert.equal(node.getAttribute('role'), 'status'); assert.equal(node.getAttribute('aria-live'), 'polite');
    click(h, 'tasksBatchReview'); assert.equal(node.textContent, h.t('tasksLoading')); assert.equal(node.classList.contains('is-error'), false);
    await settle(); assert.equal(node.textContent, h.t('tasksBatchReady')); assert.equal(node.classList.contains('is-error'), false);
    const gate = deferred(); h.backend.delay = gate.promise; click(h, 'tasksBatchConfirm');
    assert.equal(node.textContent, h.t('tasksSaving')); assert.equal(node.classList.contains('is-error'), false);
    input(editor(h), 'newer draft'); gate.resolve(); await settle();
    assert.equal(node.textContent, h.t('tasksBatchDraftRemains')); assert.equal(node.classList.contains('is-error'), false);
    assert.equal(editor(h).value, 'newer draft'); h.view.destroy();
});

test('batch feedback marks actual validation/read/uncertain errors and clears error styling on new work', async () => {
    const h = model(); await settle(); await open(h, ''); const node = modal(h).querySelector('.tasks-batch-feedback');
    await review(h); assert.equal(node.classList.contains('is-error'), true); assert.equal(node.textContent, h.t('tasksErrorText'));
    input(editor(h), 'valid'); assert.equal(node.classList.contains('is-error'), false); assert.equal(node.textContent, '');
    h.backend.failRead = true; await review(h); assert.equal(node.classList.contains('is-error'), true); assert.equal(node.textContent, h.t('tasksErrorRead'));
    h.backend.failRead = false; click(h, 'tasksBatchReview'); assert.equal(node.classList.contains('is-error'), false); await settle();
    h.backend.failAfter = true; click(h, 'tasksBatchConfirm'); await settle();
    assert.equal(node.classList.contains('is-error'), true); assert(node.textContent.includes(h.t('tasksBatchUncertain')));
    input(editor(h), 'retained newer draft'); assert.equal(node.classList.contains('is-error'), true, 'unresolved prior error remains visible');
    const gate = deferred(); const held = h.backend.lock(() => gate.promise); click(h, 'tasksBatchRetry');
    assert.equal(node.classList.contains('is-error'), false); assert.equal(node.textContent, h.t('tasksSaving'));
    gate.resolve(); await held; await settle(); assert.equal(node.classList.contains('is-error'), false); assert.equal(node.textContent, h.t('tasksBatchDraftRemains'));
    h.view.destroy();
});

test('batch feedback colors are narrowly scoped and leave existing dialog error styling unchanged', async () => {
    const css = fs.readFileSync('local-tasks.css', 'utf8');
    assert.match(css, /\.tasks-batch-feedback\s*\{\s*color:\s*var\(--template-muted\);\s*\}/);
    assert.match(css, /\.tasks-batch-feedback\.is-error\s*\{\s*color:\s*var\(--template-error\);\s*\}/);
    assert.match(css, /\.tasks-feedback\.is-error, \.tasks-dialog-feedback\s*\{\s*color:\s*var\(--template-error\);\s*\}/);
    const h = model(); await settle(); const task = await add(h.store, 'ordinary edit'); await settle(); h.view.edit(task);
    assert.equal(modal(h).querySelector('.tasks-batch-feedback'), null); assert(modal(h).querySelector('.tasks-dialog-feedback')); h.view.destroy();
});

// Model native Tab/default Enter against the current active element. Unlike a
// direct old-button dispatch, this exposes Chrome's disabled-control focus loss.
function activeKey(h, key, fields = {}) {
    const target = h.document.activeElement;
    const event = target.dispatch('keydown', { key, ...fields });
    if (!event.prevented && key === 'Enter' && target.tagName === 'BUTTON' && !target.disabled) target.dispatch('click', { detail: 0 });
    if (!event.prevented && key === 'Tab') {
        const nodes = modal(h)?.querySelectorAll('button, input, textarea').filter(node => !node.disabled && !node.closest('[hidden], [inert]') && node.getClientRects().length) || [];
        const next = nodes[nodes.indexOf(target) + (fields.shiftKey ? -1 : 1)]; next?.focus();
    }
    return event;
}
function tabTo(h, key) {
    for (let i = 0; i < 8 && h.document.activeElement !== byText(h, key); i++) activeKey(h, 'Tab');
    assert.equal(h.document.activeElement, byText(h, key));
}

test('native-like model really blurs disabled/hidden controls and sends Escape outside the old overlay', () => {
    const document = createDocument({ blurUnavailableFocus: true });
    for (const property of ['disabled', 'hidden']) {
        const overlay = document.createElement('section'), button = document.createElement('button'); overlay.append(button); document.body.append(overlay);
        let escaped = false; overlay.addEventListener('keydown', () => { escaped = true; }); button.focus(); button[property] = true;
        assert.equal(document.activeElement, document.body); document.activeElement.dispatch('keydown', { key: 'Escape' }); assert.equal(escaped, false); overlay.remove();
    }
});

for (const outcome of ['ready', 'read-error', 'pending']) test(`keyboard Tab→Review→Enter→Escape stays in batch dialog after ${outcome}`, async () => {
    const h = model('en', true, true); await settle(); await open(h); const gate = deferred(), original = h.store.reviewBatch.bind(h.store);
    if (outcome === 'pending') h.store.reviewBatch = async source => { await gate.promise; return original(source); };
    if (outcome === 'read-error') h.backend.failRead = true;
    tabTo(h, 'tasksBatchReview'); activeKey(h, 'Enter');
    assert.equal(h.document.activeElement, editor(h), 'focus moves before Review becomes disabled');
    if (outcome !== 'pending') await settle();
    assert(modal(h).contains(h.document.activeElement));
    // No click or intervening Tab should be required for Escape to work.
    activeKey(h, 'Escape'); assert.equal(modal(h), null); assert.equal(h.backend.writes, 0);
    gate.resolve(); await settle(); assert.equal(modal(h), null, 'late review cannot reopen'); h.view.destroy();
});

for (const action of ['confirm', 'retry']) test(`focused batch ${action} keeps keyboard focus inside through pending and failure`, async () => {
    const h = model('en', true, true); await settle(); await open(h); await review(h);
    if (action === 'retry') { h.backend.fail = true; click(h, 'tasksBatchConfirm'); await settle(); }
    const gate = deferred(); h.backend.delay = gate.promise; h.backend.fail = true;
    tabTo(h, action === 'confirm' ? 'tasksBatchConfirm' : 'tasksBatchRetry'); activeKey(h, 'Enter');
    assert.equal(h.document.activeElement, editor(h), 'transfer happens before disabled-control blur');
    const event = activeKey(h, 'Tab', { shiftKey: true }); assert.equal(event.prevented, true); assert.equal(h.document.activeElement, byText(h, 'tasksCancel'), 'pending Tab stays trapped');
    gate.resolve(); await settle(); assert(modal(h).contains(h.document.activeElement)); assert.equal(h.controller.error.code, 'WRITE');
    activeKey(h, 'Escape'); assert.equal(modal(h), null); assert.equal(h.backend.raw(), undefined); h.view.destroy();
});

test('hiding a focused confirmation after remote invalidation keeps Escape routed inside', async () => {
    const h = model('en', true, true); await settle(); await open(h); await review(h); byText(h, 'tasksBatchConfirm').focus();
    await add(h.remote, 'remote'); await settle(); assert.equal(h.document.activeElement, editor(h));
    assert.equal(byText(h, 'tasksBatchConfirm').hidden, true); activeKey(h, 'Escape'); assert.equal(modal(h), null); h.view.destroy();
});

test('native-like focus repair cannot reclaim a newer field or reopened dialog', async () => {
    const h = model('en', true, true); await settle(); await open(h); await review(h); const gate = deferred(); h.backend.delay = gate.promise;
    tabTo(h, 'tasksBatchConfirm'); activeKey(h, 'Enter'); input(editor(h), 'newer draft'); editor(h).focus();
    activeKey(h, 'Escape'); h.view.addBatch(); input(editor(h), 'reopened draft'); const newer = editor(h); newer.focus();
    gate.resolve(); await settle(); assert.equal(editor(h), newer); assert.equal(newer.value, 'reopened draft'); assert.equal(h.document.activeElement, newer);
    assert.deepEqual(h.backend.raw().records.map(task => task.text), ['one', 'two']); h.view.destroy();
});

for (const locale of ['en', 'zh_CN']) test(`batch help explicitly states per-task text limit (${locale})`, async () => {
    const h = model(locale); await settle(); await open(h); const help = h.document.getElementById(editor(h).getAttribute('aria-describedby'));
    assert(help.textContent.includes(h.t('tasksBatchTextLimit'))); assert.match(h.t('tasksBatchTextLimit'), locale === 'en' ? /1,000 characters per task/ : /每项最多 1,000 个字符/); h.view.destroy();
});
