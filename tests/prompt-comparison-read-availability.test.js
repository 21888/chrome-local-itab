const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Controller } = require('../shared/local-prompts-controller.js');
const { fixture, Backup, Workspaces, Prompts, copy } = require('./helpers/complete-backup-acceptance.js');
const { createDocument } = require('./helpers/task-dom-model.js');

// Real Manager/backend/Store/Controller/View and reviewed restore recovery.
// Only Chrome storage/events/locks and the DOM are synthetic. In particular,
// operation-owned errors and unavailable reads are never assigned by a test.
const timestamp = '2026-10-19T21:00:00.000Z';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let index = 0; index < 8; index++) await tick(); }
const text = node => [node.textContent || '', ...node.children.map(text)].join('');

function cleanFixture() {
    const calls = { clock: 0, promptClock: 0, viewClock: 0, provider: 0, network: 0 };
    const f = fixture({ extra: false, trash: false, clock: () => { calls.clock++; return timestamp; } });
    delete f.raw.__auth; f.raw.sync = { enabled: false }; f.raw.privacy = { onlineFavicons: false };
    const provider = () => { calls.provider++; throw new Error('Provider forbidden'); };
    f.manager.ensureSyncInitialized = provider; f.manager.scheduleSyncPush = provider;
    return { ...f, calls };
}
async function seed(f, name) {
    let serial = 0;
    const store = new Prompts.Store(f.workspaceManager.createPromptBackend(Prompts), {
        id: () => `${name}_comparison_${++serial}`,
        now: () => { f.calls.promptClock++; return timestamp; }
    });
    const initial = await store.mutate(store.request('add', {
        title: `Synthetic ${name}`, body: 'Synthetic first {{topic}}\r\n<literal>', favorite: false
    }));
    const record = initial.records[0];
    await store.mutate(store.request('edit', {
        id: record.id, version: record.version, body: 'Synthetic second {{topic}}\n<literal>'
    }));
    return store;
}
async function mount(t) {
    const f = cleanFixture(), listeners = new Set(), events = [];
    f.chrome.storage.onChanged = { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) };
    const set = f.chrome.storage.local.set;
    f.chrome.storage.local.set = async values => {
        const before = copy(f.raw); await set(values);
        const changes = Object.fromEntries(Object.keys(values).filter(key => !Workspaces.same(before[key], f.raw[key])).map(key => [key, {
            ...(before[key] === undefined ? {} : { oldValue: before[key] }), newValue: copy(f.raw[key])
        }]));
        if (Object.keys(changes).length) {
            events.push({ keys: Object.keys(changes), marker: f.raw[Workspaces.RESTORE_TRANSACTION_KEY]?.status || null });
            for (const listener of [...listeners]) listener(copy(changes), 'local');
        }
    };
    const promptStore = await seed(f, 'original'), c = new Controller({ store: promptStore });
    t.after(() => c.dispose());
    const doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'); doc.body.append(host);
    class ObservedDate extends Date {
        constructor(...args) { if (!args.length) f.calls.viewClock++; super(...args); }
        static now() { f.calls.viewClock++; return Date.parse(timestamp); }
    }
    const network = () => { f.calls.network++; throw new Error('Network forbidden'); };
    const root = { document: doc, LocalItabPrompts: Prompts, addEventListener() {}, removeEventListener() {}, fetch: network };
    const context = vm.createContext({ window: root, Intl, Date: ObservedDate, Object, Array, Boolean, String, Promise, fetch: network });
    for (const file of ['dialog-focus', 'local-prompts-view']) {
        vm.runInContext(fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8'), context);
    }
    const view = new root.LocalItabPromptsView.View({ host, controller: c });
    view.render(); await c.start(); await settle();
    assert.equal(c.record().history.length, 2);
    c.setVariable('topic', 'Synthetic retained variable');
    return { ...f, c, doc, view, promptStore, events };
}
function focusNode(h, key) {
    const node = h.view.main.querySelector(`[data-prompt-focus="${key}"]`);
    assert.ok(node, `${key} is present`); return node;
}
function open(h) {
    h.view.main.querySelector('.prompt-history').open = true;
    const opener = focusNode(h, 'compare-open'); assert.equal(Boolean(opener.disabled), false);
    opener.dispatch('click'); assert.ok(h.view.comparison);
    const panel = h.view.main.querySelector('.prompt-comparison'); assert.equal(panel.hidden, false);
    return panel;
}
function footprint(h) {
    return {
        raw: JSON.stringify(h.raw), writes: h.writes.length, calls: { ...h.calls },
        session: JSON.stringify(h.c.session()), historyId: h.view.historyId,
        savedHistory: JSON.stringify(h.c.record().history)
    };
}
function unchanged(h, before) {
    assert.deepEqual(footprint(h), before, 'comparison/read attempts preserve raw storage, clocks, providers, preview and selected history');
    assert.equal(h.calls.provider, 0); assert.equal(h.calls.network, 0);
}
async function interruptRestore(h) {
    const incoming = cleanFixture(); await seed(incoming, 'incoming');
    const plan = await h.store.review(await incoming.store.export(Backup.MODULES.filter(name => name !== 'collections')), null, { promptTarget: 'global-library' });
    let current = true;
    h.hooks.set = (values, raw) => {
        Object.assign(raw, copy(values));
        if (values[Workspaces.RESTORE_TRANSACTION_KEY]?.status === 'prepared') current = false;
    };
    try {
        await assert.rejects(h.store.restore(plan, { confirmed: true, isCurrent: () => current }), { code: 'UNCONFIRMED' });
    } finally { delete h.hooks.set; }
    await settle();
    assert.equal(h.raw[Workspaces.RESTORE_TRANSACTION_KEY].status, 'prepared');
    assert.equal(h.c.linkedPromptUnavailable, true); assert.equal(h.c.pendingReadGeneration, null);
}
async function failFavorite(h) {
    await interruptRestore(h);
    const raw = JSON.stringify(h.raw), writes = h.writes.length, confirmed = h.c.state;
    const favorite = focusNode(h, 'favorite-action'); assert.equal(Boolean(favorite.disabled), false);
    const action = h.c.action.bind(h.c); let pending;
    h.c.action = (...args) => (pending = action(...args));
    try { favorite.dispatch('click'); assert.equal(await pending, false); await settle(); }
    finally { h.c.action = action; }
    assert.deepEqual(h.c.error, { code: 'WORKSPACE_RESTORE_PENDING', scope: 'favorite' });
    assert.equal(h.c.linkedPromptUnavailable, true); assert.equal(h.c.pendingReadGeneration, null);
    assert.equal(h.c.pendingCommand, null); assert.equal(h.c.state, confirmed); assert.equal(h.c.record().favorite, false);
    assert.equal(JSON.stringify(h.raw), raw); assert.equal(h.writes.length, writes);
    return h.c.error;
}
async function recover(h) {
    const failure = h.c.error, status = text(h.view.status), events = h.events.length;
    const promptBytes = JSON.stringify(h.raw[Prompts.KEY]);
    const review = await h.store.inspectInterruptedRestore(); assert.equal(review.outcome, 'previous-present');
    assert.equal((await h.store.recoverInterruptedRestore(review, { confirmed: true })).recovered, true);
    await settle();
    assert.deepEqual(h.events.slice(events), [{ keys: [Workspaces.RESTORE_TRANSACTION_KEY], marker: 'recovered' }]);
    assert.equal(JSON.stringify(h.raw[Prompts.KEY]), promptBytes);
    assert.equal(h.c.linkedPromptUnavailable, false); assert.equal(h.c.error, failure);
    assert.equal(text(h.view.status), status); assert.equal(h.c.record().favorite, false);
    assert.equal(h.c.notice, ''); assert.equal(h.c.pendingCommand, null);
}

test('failed read disables comparison even when Favorite owns the visible error', async t => {
    const h = await mount(t); const failure = await failFavorite(h), before = footprint(h);
    assert.equal(focusNode(h, 'compare-open').disabled, true);
    assert.equal(h.view.comparison == null, true);
    await h.c.refresh();
    assert.equal(h.c.error, failure); assert.equal(focusNode(h, 'compare-open').disabled, true);
    unchanged(h, before);
});

test('forced comparison opener click rejects unavailable data independently of disabled UI', async t => {
    const h = await mount(t), oldOpener = focusNode(h, 'compare-open');
    const failure = await failFavorite(h), before = footprint(h);
    // Synthetic dispatch intentionally bypasses native disabled-control handling.
    focusNode(h, 'compare-open').dispatch('click');
    assert.equal(h.view.comparison == null, true, 'current opener handler rejects the failed-read snapshot');
    oldOpener.dispatch('click');
    assert.equal(h.view.comparison == null, true, 'captured opener handler also rejects the failed-read snapshot');
    assert.equal(h.view.main.querySelector('.prompt-comparison').hidden, true);
    assert.equal(h.c.error, failure); unchanged(h, before);
});

test('a later real failed read clears an open comparison with retained Favorite feedback', async t => {
    const h = await mount(t), failure = await failFavorite(h); await recover(h);
    open(h); const from = focusNode(h, 'compare-from'), to = focusNode(h, 'compare-to');
    const pair = { ...h.view.comparison }, retained = h.view.comparison;
    await interruptRestore(h);
    assert.equal(h.c.error, failure); assert.equal(h.view.comparison, null);
    assert.equal(h.view.main.querySelector('.prompt-comparison').hidden, true);
    assert.equal(focusNode(h, 'compare-open').disabled, true);
    const before = footprint(h);
    from.value = pair.to; from.dispatch('change'); to.value = pair.from; to.dispatch('change');
    assert.equal(h.view.comparison, null); assert.deepEqual({ ...retained }, pair);
    await h.c.refresh(); assert.equal(h.view.comparison, null); assert.equal(h.c.error, failure);
    unchanged(h, before);
});

for (const side of ['from', 'to']) test(`late ${side} change rejects failed read before the view rerenders`, async t => {
    const h = await mount(t), failure = await failFavorite(h); await recover(h); open(h);
    const selector = focusNode(h, `compare-${side}`), retained = h.view.comparison, pair = { ...retained };
    const render = h.c.onChange; let observed;
    h.c.onChange = kind => {
        // Deliver an already queued DOM event at the real failed-read notification,
        // before render has a chance to null the pair. This isolates the handler
        // guard from the separate render invalidation without fabricating state.
        if (!observed && h.c.linkedPromptUnavailable && h.c.error === failure && h.view.comparison === retained) {
            const before = footprint(h); selector.value = side === 'from' ? pair.to : pair.from;
            selector.dispatch('change');
            observed = { pair: { ...retained }, before, after: footprint(h) };
        }
        render(kind);
    };
    await interruptRestore(h); h.c.onChange = render;
    assert.ok(observed, 'the real failed-read notification reached the captured selector');
    assert.deepEqual(observed.pair, pair, 'late event cannot mutate either comparison selection');
    assert.deepEqual(observed.after, observed.before);
    assert.equal(h.view.comparison, null); assert.equal(h.c.error, failure);
    assert.equal(h.calls.provider, 0); assert.equal(h.calls.network, 0);
});

test('successful read retaining both versions preserves an explicit pair without side effects', async t => {
    const h = await mount(t); open(h);
    const initial = { ...h.view.comparison };
    const from = focusNode(h, 'compare-from'); from.value = initial.to; from.dispatch('change');
    const to = focusNode(h, 'compare-to'); to.value = initial.from; to.dispatch('change');
    const pair = { ...h.view.comparison }, before = footprint(h), previous = h.c.state;
    await h.c.refresh();
    assert.notEqual(h.c.state, previous); assert.deepEqual({ ...h.view.comparison }, pair);
    assert.equal(h.view.main.querySelector('.prompt-history').open, true);
    assert.equal(h.view.main.querySelector('.prompt-comparison').hidden, false);
    assert.equal(Boolean(focusNode(h, 'compare-open').disabled), false);
    assert.equal(h.c.linkedPromptUnavailable, false); unchanged(h, before);
});

test('reviewed recovery allows comparison again while preserving Favorite error ownership', async t => {
    const h = await mount(t), failure = await failFavorite(h); await recover(h);
    const status = text(h.view.status), before = footprint(h); open(h);
    const pair = { ...h.view.comparison };
    const to = focusNode(h, 'compare-to'); to.value = pair.from; to.dispatch('change');
    assert.equal(h.view.comparison.to, pair.from);
    assert.match(h.view.main.querySelector('.prompt-comparison [role="status"]').textContent, /identical/);
    assert.equal(h.c.error, failure); assert.equal(text(h.view.status), status);
    assert.equal(h.view.status.classList.contains('error'), true);
    assert.equal(h.c.notice, ''); unchanged(h, before);
});
