const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store.js');
const { setup, add, settle } = require('./helpers/collections-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');

async function mount(language = 'en') {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true });
    const host = doc.createElement('div'); doc.body.append(host);
    const events = new Map(), root = { document: doc, LocalItabAICollections: Core,
        addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise, Map });
    for (const file of ['dialog-focus', 'local-ai-collections-view']) vm.runInContext(fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8'), context);
    const messages = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`, 'utf8'));
    const label = (key, fallback) => messages[`collections${key}`]?.message || fallback;
    const view = new root.LocalItabCollectionsView.View({ host, controller: h.controller, translate: label });
    // prompts.css hides an empty status region; an empty node cannot take focus.
    const statusRects = view.status.getClientRects.bind(view.status), replaceStatus = view.status.replaceChildren.bind(view.status);
    let statusText = '';
    view.status.replaceChildren = (...nodes) => { statusText = ''; replaceStatus(...nodes); };
    Object.defineProperty(view.status, 'textContent', {
        get() { return statusText + view.status.children.map(node => node.textContent || '').join(''); },
        set(value) { view.status.replaceChildren(); statusText = value; }
    });
    view.status.getClientRects = () => view.status.textContent || view.status.children.length ? statusRects() : [];
    view.render(); view.attachDepartureGuard(); await h.controller.start(); await settle(h.controller);
    return { ...h, h, host, doc, view, events, label };
}
function editButton(h) { return h.view.main.querySelectorAll('button').find(button => button.textContent === h.label('Edit', 'Edit details')); }
async function pendingSave(h, outcome, action) {
    const c = h.controller, original = await add(c, 'Synthetic original', '  Exact saved body\r\n中文 🧪  ');
    c.select(original.id); // Clear the earlier save notice, like an ordinary visit.
    editButton(h).dispatch('click');
    for (const [name, value] of [['title', 'Synthetic title'], ['notes', '  Exact annotation\r\n中文 🧪 <b>literal</b>  '], ['tagsText', 'research, 中文']]) {
        const input = h.view.editor.fields[name]; input.value = value; input.dispatch('input');
    }
    assert.equal(h.view.status.getClientRects().length, 0, 'the idle status starts CSS-hidden');
    const snapshot = JSON.stringify(c.draft().input), writes = h.h.writes, gate = deferred(), entered = deferred();
    const write = h.backend.write.bind(h.backend);
    // A definitive CAPACITY refusal is injected before any write. Success and
    // uncertainty use the real Store and its write/readback protocol.
    if (outcome === 'capacity') h.store.mutate = async () => { entered.resolve(); await gate.promise; throw Core.fault('CAPACITY'); };
    else h.backend.write = async state => { entered.resolve(); await gate.promise; return write(state); };
    if (outcome === 'uncertain') h.h.failOnce();
    let saving; const save = h.view.save.bind(h.view); h.view.save = (...args) => (saving = save(...args));
    if (action === 'click') { h.view.editor.save.focus(); h.view.editor.save.dispatch('click'); }
    else if (action === 'submit') { h.view.editor.fields.title.focus(); h.view.main.querySelector('form').dispatch('submit'); }
    else { h.view.editor.fields.notes.focus(); h.view.editor.fields.notes.dispatch('keydown', { key: 's', ctrlKey: true }); }
    await entered.promise;
    return { original, snapshot, writes, gate, finish: async () => { gate.resolve(); await saving; await settle(c); },
        check() {
            assert.equal(h.h.writes, writes + (outcome === 'capacity' ? 0 : 1));
            assert.deepEqual(c.record().history, original.history); assert.equal(c.record().body, original.body);
            if (outcome === 'success') {
                assert.equal(c.draft(), undefined); assert.equal(c.record().title, 'Synthetic title');
                assert.equal(c.record().notes, JSON.parse(snapshot).notes); assert.deepEqual(c.record().tags, ['research', '中文']);
            } else {
                assert.equal(JSON.stringify(c.draft().input), snapshot);
                assert.equal(Boolean(c.pendingCommand), outcome === 'uncertain');
                assert.equal(h.view.editor.fields.notes.disabled, outcome === 'uncertain');
            }
        }
    };
}

for (const language of ['en', 'zh_CN']) test(`${language}: Edit details places focus in the retained metadata draft`, async () => {
    const h = await mount(language), c = h.controller, original = await add(c);
    const edit = editButton(h); edit.focus(); edit.dispatch('click');
    assert.ok(h.doc.activeElement === h.view.editor.fields.title, 'removed Edit button must hand focus to the title field');
    assert.equal(h.view.editor.fields.body.readOnly, true);
    const input = h.view.editor.fields.notes, draft = c.draft(), writes = h.h.writes;
    input.focus(); input.value = 'Exact unsaved note'; input.dispatch('input');
    assert.ok(h.doc.activeElement === input); assert.equal(c.draft(), draft);
    h.view.search.value = 'unmatched'; h.view.search.dispatch('input'); h.view.clearFilters.dispatch('click');
    assert.ok(h.doc.activeElement === input); assert.equal(h.view.editor.fields.notes, input);
    assert.equal(c.draft(), draft); assert.equal(c.draft().input.notes, 'Exact unsaved note');
    assert.deepEqual(c.record(), original); assert.equal(h.h.writes, writes); c.dispose();
});

for (const language of ['en', 'zh_CN']) for (const action of ['click', 'submit', 'shortcut']) for (const outcome of ['success', 'capacity', 'uncertain']) {
    test(`${language}: metadata ${action} ${outcome} keeps feedback focus through disabling and remounting`, async () => {
        const h = await mount(language), c = h.controller, pending = await pendingSave(h, outcome, action);
        assert.equal(c.busy, true); assert.equal(h.view.editor.fields.notes.disabled, true);
        assert.ok(h.doc.activeElement === h.view.status, 'a pending save keeps focus on its stable status region');
        const draft = c.draft(); h.view.editor.fields.notes.value = 'Ignored pending edit'; h.view.editor.fields.notes.dispatch('input');
        assert.equal(c.draft(), draft); assert.equal(JSON.stringify(c.draft().input), pending.snapshot);
        const before = { prevented: false, preventDefault() { this.prevented = true; } }; h.events.get('beforeunload')(before); assert.equal(before.prevented, true);
        await h.view.save(); assert.equal(c.busy, true);
        await pending.finish(); pending.check();
        assert.ok(h.doc.activeElement === h.view.status, 'the same result region remains focused without a late focus restore'); c.dispose();
    });
}

for (const outcome of ['success', 'capacity', 'uncertain']) for (const target of ['search', 'type', 'tool', 'tag', 'archived']) {
    test(`metadata ${outcome} respects newer ${target} focus and filters`, async () => {
        const h = await mount(), c = h.controller, pending = await pendingSave(h, outcome, 'click');
        const control = target === 'search' ? h.view.search : target === 'archived' ? h.view.nav.trash : h.view.filters[target];
        control.focus();
        if (target === 'search') { control.value = 'Synthetic'; control.dispatch('input'); }
        else if (target === 'archived') control.dispatch('click');
        else { control.value = target === 'type' ? 'code' : 'Synthetic filter'; control.dispatch('change'); }
        await pending.finish(); pending.check();
        assert.ok(h.doc.activeElement === control, 'save completion cannot take focus back');
        if (target === 'search') assert.equal(c.filters.query, 'Synthetic');
        else if (target === 'archived') assert.equal(c.filters.mode, 'trash');
        else assert.equal(c.filters[target], target === 'type' ? 'code' : 'Synthetic filter');
        await c.refresh(); assert.ok(h.doc.activeElement === control); c.dispose();
    });
}

for (const change of ['body', 'hidden', 'persisted pagehide', 'dispose']) test(`pending metadata save never restores focus after ${change}`, async () => {
    const h = await mount(), c = h.controller, pending = await pendingSave(h, 'success', 'shortcut');
    if (change === 'hidden') { h.doc.visibilityState = 'hidden'; h.doc.body.focus(); await h.doc.listeners.get('visibilitychange')({}); }
    else if (change === 'persisted pagehide') { h.events.get('pagehide')({ persisted: true }); h.doc.body.focus(); }
    else if (change === 'dispose') { c.dispose(); h.doc.body.focus(); }
    else h.doc.body.focus();
    await pending.finish(); assert.ok(h.doc.activeElement === h.doc.body); c.dispose();
});

test('view save invoked with existing search focus does not move it to status', async () => {
    const h = await mount(), c = h.controller; await add(c); c.edit(); c.update('notes', 'Synthetic note');
    h.view.search.focus(); await h.view.save(); await settle(c);
    assert.ok(h.doc.activeElement === h.view.search); c.dispose();
});

test('metadata validation rejection publishes visible feedback without losing draft or writing', async () => {
    const h = await mount(), c = h.controller, original = await add(c); c.select(original.id); editButton(h).dispatch('click');
    const input = h.view.editor.fields.tagsText; input.focus(); input.value = 'duplicate, DUPLICATE'; input.dispatch('input');
    const before = JSON.stringify(c.draft().input), writes = h.h.writes;
    await h.view.save();
    assert.ok(h.doc.activeElement === h.view.status); assert.equal(h.view.status.getClientRects().length, 1);
    assert.equal(JSON.stringify(c.draft().input), before); assert.equal(h.h.writes, writes); assert.deepEqual(c.record(), original);
    assert.equal(c.pendingCommand, null); assert.equal(h.view.editor.fields.tagsText.disabled, false); c.dispose();
});

test('metadata conflict copy keeps the local draft and original body while focusing save feedback', async () => {
    const h = await mount(), c = h.controller, original = await add(c); c.edit(); c.update('notes', 'Local unsaved annotation');
    await h.store.mutate(h.store.request('edit', { id: original.id, version: original.version, notes: 'Remote saved annotation' }));
    await c.refresh(); assert.equal(c.draft().conflict, true);
    const before = h.h.raw.records.find(record => record.id === original.id), writes = h.h.writes;
    const copy = h.view.main.querySelectorAll('button').find(button => button.textContent === h.label('SaveCopy', 'Save draft as new item'));
    let saving; const save = h.view.save.bind(h.view); h.view.save = (...args) => (saving = save(...args));
    copy.focus(); copy.dispatch('click'); await saving; await settle(c);
    assert.ok(h.doc.activeElement === h.view.status); assert.equal(c.record().notes, 'Local unsaved annotation');
    assert.equal(c.record().body, original.body); assert.notEqual(c.record().id, original.id);
    assert.deepEqual(h.h.raw.records.find(record => record.id === original.id), before); assert.equal(h.h.writes, writes + 1); c.dispose();
});

test('uncertain metadata save keeps exact operation through status retry and does not duplicate writes', async () => {
    const h = await mount(), c = h.controller, pending = await pendingSave(h, 'uncertain', 'click');
    await pending.finish(); pending.check(); const operation = c.pendingCommand, writes = h.h.writes;
    const retry = h.view.status.querySelectorAll('button').find(button => button.textContent === h.label('Retry', 'Check / retry the same save'));
    const gate = deferred(), entered = deferred(), mutate = h.store.mutate.bind(h.store);
    h.store.mutate = async command => { assert.equal(command, operation.command); entered.resolve(); await gate.promise; return mutate(command); };
    let retrying; const doRetry = c.retry.bind(c); c.retry = () => (retrying = doRetry());
    retry.focus(); retry.dispatch('click'); await entered.promise;
    h.view.search.focus(); h.view.search.value = 'Synthetic'; h.view.search.dispatch('input');
    gate.resolve(); await retrying; await settle(c);
    assert.ok(h.doc.activeElement === h.view.search); assert.equal(c.pendingCommand, null); assert.equal(c.draft(), undefined);
    assert.equal(c.record().id, pending.original.id); assert.equal(c.record().notes, JSON.parse(pending.snapshot).notes);
    assert.equal(h.h.writes, writes); assert.equal(h.h.raw.records.length, 1); assert.deepEqual(c.record().history, pending.original.history); c.dispose();
});

test('metadata discard cancellation preserves fields and explicit discard reopens saved values without writes', async () => {
    const h = await mount(), c = h.controller, original = await add(c); editButton(h).dispatch('click');
    c.update('title', 'Unsaved title'); c.update('notes', 'Unsaved note'); c.update('tagsText', 'unsaved');
    const draft = c.draft(), writes = h.h.writes, discard = h.view.main.querySelectorAll('button').find(button => button.textContent === h.label('Discard', 'Discard draft'));
    discard.focus(); const cancelled = h.view.discard();
    h.doc.body.querySelector('.prompt-dialog-overlay').querySelector('button').dispatch('click'); await cancelled;
    assert.equal(c.draft(), draft); assert.ok(h.doc.activeElement === discard); assert.equal(h.h.writes, writes);
    const confirmed = h.view.discard(); h.doc.body.querySelector('.prompt-dialog-overlay').querySelector('.prompt-primary').dispatch('click'); await confirmed;
    assert.equal(c.draft(), undefined); assert.deepEqual(c.record(), original); assert.equal(h.h.writes, writes);
    editButton(h).dispatch('click'); assert.ok(h.doc.activeElement === h.view.editor.fields.title);
    assert.equal(h.view.editor.fields.title.value, original.title); assert.equal(h.view.editor.fields.notes.value, original.notes);
    assert.equal(h.view.editor.fields.tagsText.value, original.tags.join(', ')); c.dispose();
});
