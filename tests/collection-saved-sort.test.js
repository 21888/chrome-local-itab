const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store');
const { Controller } = require('../shared/local-ai-collections-controller');
const { createDocument } = require('./helpers/task-dom-model');
const { tick } = require('./helpers/collections-harness');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const titles = view => view.list.querySelectorAll('.prompt-card-title').map(node => node.textContent);

// Independent real Store/Controller fixture: initial-save and update clocks differ.
// The shared collections harness intentionally uses one fixed date and stays unchanged.
async function mount({ locale = 'en', count = 4 } = {}) {
    let raw, serial = 0, now = '2026-10-01T00:00:00.000Z', queue = Promise.resolve();
    const listeners = new Set(), calls = { read: 0, write: 0, network: 0, clipboard: 0, grant: 0 };
    const backend = {
        lock(action) { const run = queue.then(action); queue = run.catch(() => {}); return run; },
        async read() { calls.read++; return clone(raw); },
        async write(value) { calls.write++; raw = clone(value); for (const listener of listeners) listener(); },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
    };
    const store = new Core.Store(backend, { id: () => `sort_${String(++serial).padStart(8, '0')}`, now: () => now });
    const at = day => { now = new Date(Date.UTC(2026, 9, day)).toISOString(); };
    const add = async (day, title, values = {}) => {
        at(day); const command = store.request('add', { title, body: `needle ${title}`, type: 'code', tool: 'Example', tags: ['study'], ...values });
        const state = await store.mutate(command); await tick(); return state.records.find(record => record.id === command.operationId);
    };
    const edit = async (day, record, values) => {
        at(day); const state = await store.mutate(store.request('edit', { id: record.id, version: record.version, ...values }));
        await tick(); return state.records.find(item => item.id === record.id);
    };
    const records = [];
    for (let index = 0; index < count; index++) records.push(await add(count === 4 ? [1, 2, 2, 3][index] : index + 1, `Saved ${index + 1}`));
    if (count === 4) {
        records[0] = await edit(4, records[0], { notes: 'needle annotation update' });
        records[2] = await edit(5, records[2], { notes: 'needle later annotation' });
    }
    const c = new Controller({ store }), doc = createDocument({ blurUnavailableFocus: true }), events = new Map();
    const host = doc.createElement('main'); doc.body.append(host);
    const messages = locale === 'fallback' ? {} : JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const root = { document: doc, LocalItabAICollections: Core, i18n: { t: key => messages[key]?.message || key },
        getComputedStyle: node => node.style,
        addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key),
        fetch: () => { calls.network++; }, navigator: { clipboard: { writeText: () => { calls.clipboard++; } } },
        chrome: { permissions: { request: () => { calls.grant++; } } } };
    const context = vm.createContext({ window: root });
    for (const name of ['dialog-focus', 'local-ai-collections-view']) vm.runInContext(fs.readFileSync(`shared/${name}.js`, 'utf8'), context);
    const View = root.LocalItabCollectionsView.View, view = new View({ host, controller: c }); await c.start();
    const select = view.sortSelect;
    assert.ok(select, 'the collection sidebar has a native page-local sort selector');
    const choose = value => { select.value = value; select.dispatch('change'); };
    const resetIO = () => Object.keys(calls).forEach(key => { calls[key] = 0; });
    return { c, store, view, View, doc, host, events, calls, records, at, add, edit, choose, resetIO };
}
const noIO = f => assert.deepEqual(f.calls, { read: 0, write: 0, network: 0, clipboard: 0, grant: 0 });
const keepMain = (view, nodes) => { assert.equal(view.main.children.length, nodes.length); nodes.forEach((node, index) => assert.equal(view.main.children[index], node)); };

test('default order is unchanged; earliest save uses createdAt then ID on a copied result array with zero IO', async () => {
    const f = await mount(), { c, view, records, doc } = f;
    assert.deepEqual(titles(view), ['Saved 3', 'Saved 1', 'Saved 4', 'Saved 2']);
    assert.deepEqual(titles(view), c.results().map(item => item.record.title));
    assert.equal(view.sortSelect.value, 'updated');
    assert.equal(records[1].createdAt, records[2].createdAt); assert.notEqual(records[1].updatedAt, records[2].updatedAt);
    c.select(records[2].id); const selected = c.selected, main = view.main.children.slice(), generation = view.detailGeneration;
    const results = Object.freeze(c.results()), original = JSON.stringify(results), state = JSON.stringify(c.state);
    Object.freeze(c.state.records); c.results = () => results; f.resetIO();
    view.sortSelect.focus(); const focused = doc.activeElement;
    f.choose('saved'); assert.deepEqual(titles(view), ['Saved 1', 'Saved 2', 'Saved 3', 'Saved 4']);
    f.choose('updated'); assert.deepEqual(titles(view), results.map(item => item.record.title));
    f.choose('saved'); assert.equal(doc.activeElement, focused); assert.equal(c.selected, selected);
    keepMain(view, main); assert.equal(view.detailGeneration, generation);
    assert.equal(JSON.stringify(results), original); assert.equal(JSON.stringify(c.state), state); noIO(f); c.dispose();
});

test('annotation updates retain earliest-save order, refresh retains the choice, and remount resets it', async () => {
    const f = await mount(), { c, view, records } = f; f.choose('saved');
    const before = c.record(records[1].id), history = JSON.stringify(before.history), createdAt = before.createdAt;
    await f.edit(6, before, { notes: 'new annotation only' });
    assert.equal(c.record(before.id).createdAt, createdAt); assert.equal(JSON.stringify(c.record(before.id).history), history);
    assert.notEqual(c.record(before.id).updatedAt, before.updatedAt); assert.equal(view.sortSelect.value, 'saved');
    assert.deepEqual(titles(view), ['Saved 1', 'Saved 2', 'Saved 3', 'Saved 4']);
    await c.refresh(); assert.equal(view.sortSelect.value, 'saved'); assert.deepEqual(titles(view), ['Saved 1', 'Saved 2', 'Saved 3', 'Saved 4']);
    f.choose('updated'); assert.deepEqual(titles(view), ['Saved 2', 'Saved 3', 'Saved 1', 'Saved 4']);
    f.choose('saved'); view.destroy(); view.shell.remove();
    const next = new f.View({ host: f.host, controller: c }); next.render();
    assert.equal(next.sortSelect.value, 'updated'); assert.deepEqual(titles(next), c.results().map(item => item.record.title)); c.dispose();
});

test('sorting intersects query/type/tool/tag and archive filters, while clear filters retains page order', async () => {
    const f = await mount(), { c, view } = f;
    await f.add(7, 'Wrong query', { body: 'different' });
    await f.add(8, 'Wrong type', { type: 'answer' });
    await f.add(9, 'Wrong tool', { tool: 'Other' });
    await f.add(10, 'Wrong tag', { tags: ['other'] });
    for (const [index, day] of [[0, 11], [2, 12]]) {
        f.at(day); const record = c.record(f.records[index].id);
        await f.store.mutate(f.store.request('remove', { id: record.id, version: record.version })); await tick();
    }
    const state = JSON.stringify(c.state), selected = c.selected; f.resetIO();
    for (const mode of ['all', 'trash']) for (let mask = 0; mask < 16; mask++) {
        c.filter({ mode, query: mask & 1 ? 'needle' : '', type: mask & 2 ? 'code' : '', tool: mask & 4 ? 'Example' : '', tag: mask & 8 ? 'study' : '' });
        const savedResults = c.results(), recent = savedResults.map(item => item.record.title);
        const earliest = savedResults.slice().sort((a, b) => a.record.createdAt.localeCompare(b.record.createdAt) || a.record.id.localeCompare(b.record.id)).map(item => item.record.title);
        f.choose('saved'); assert.deepEqual(titles(view), earliest); assert.equal(view.sortSelect.value, 'saved');
        f.choose('updated'); assert.deepEqual(titles(view), recent);
        if (mask === 15) assert.deepEqual(earliest, mode === 'all' ? ['Saved 2', 'Saved 4'] : ['Saved 1', 'Saved 3']);
    }
    f.choose('saved'); view.clearFilters.dispatch('click');
    assert.equal(c.filters.mode, 'trash'); assert.equal(view.sortSelect.value, 'saved'); assert.deepEqual(titles(view), ['Saved 1', 'Saved 3']);
    c.filter({ query: 'no such result' }); assert.deepEqual(titles(view), []); assert.match(view.listCount.textContent, /^0 /);
    view.clearFilters.dispatch('click'); assert.deepEqual(titles(view), ['Saved 1', 'Saved 3']);
    assert.equal(c.selected, selected); assert.equal(JSON.stringify(c.state), state); noIO(f); c.dispose();
});

test('empty, single-item and actual 200-item Store capacity render without selecting a different record', async () => {
    for (const count of [0, 1, Core.LIMITS.records]) {
        assert.equal(Core.LIMITS.records, 200);
        const f = await mount({ count }), { c, view } = f, selected = c.selected;
        const recent = titles(view), ascending = f.records.map(record => record.title); f.resetIO();
        f.choose('saved'); assert.deepEqual(titles(view), ascending); assert.match(view.listCount.textContent, new RegExp(`^${count} `));
        f.choose('updated'); assert.deepEqual(titles(view), recent); assert.equal(c.selected, selected); noIO(f);
        if (count === 200) {
            const before = JSON.stringify(c.state);
            await assert.rejects(f.add(201, 'Over capacity'), error => error.code === 'CAPACITY');
            assert.equal(c.state.records.length, 200); assert.equal(JSON.stringify(c.state), before);
        }
        c.dispose();
    }
});

test('round-trip sorting keeps selected metadata/new drafts, proposal text, detail history nodes and focus', async () => {
    const f = await mount(), { c, view, doc } = f, id = f.records[0].id;
    c.select(id); view.proposals.set(id, 'Keep proposed body'); c.edit();
    const editor = view.editor, draft = c.draft(), notes = editor.fields.notes;
    notes.value = 'Keep unsaved annotation\r\n中文'; notes.dispatch('input');
    notes.focus(); const main = view.main.children.slice(), generation = view.detailGeneration; f.resetIO();
    f.choose('saved'); f.choose('updated'); f.choose('saved');
    assert.equal(view.editor, editor); assert.equal(c.draft(), draft); assert.equal(notes.value, 'Keep unsaved annotation\r\n中文');
    assert.equal(doc.activeElement, notes); keepMain(view, main); assert.equal(view.detailGeneration, generation); noIO(f);
    c.create(); const newDraft = c.draft(), newEditor = view.editor, body = newEditor.fields.body;
    newEditor.fields.title.value = 'New unsaved title'; newEditor.fields.title.dispatch('input');
    body.value = 'New unsaved body'; body.dispatch('input'); body.focus();
    f.choose('updated'); f.choose('saved');
    assert.equal(c.selected, 'new'); assert.equal(c.draft(), newDraft); assert.equal(view.editor, newEditor); assert.equal(doc.activeElement, body);
    assert.equal(body.value, 'New unsaved body'); assert.equal(newDraft.input.title, 'New unsaved title');
    assert.equal(c.drafts.get(id), draft); assert.equal(view.proposals.get(id), 'Keep proposed body'); noIO(f);
    c.select(f.records[2].id);
    const history = view.main.querySelector('.prompt-history'); history.open = true;
    const oldBody = history.querySelector('pre'); oldBody.scrollTop = 27; oldBody.tabIndex = 0; oldBody.focus();
    const detail = view.main.children.slice(), allDrafts = JSON.stringify([...c.drafts]);
    f.choose('updated'); f.choose('saved'); keepMain(view, detail);
    assert.equal(history.open, true); assert.equal(history.querySelector('pre'), oldBody); assert.equal(oldBody.scrollTop, 27); assert.equal(doc.activeElement, oldBody);
    assert.equal(JSON.stringify([...c.drafts]), allDrafts); assert.equal(view.proposals.get(id), 'Keep proposed body'); noIO(f); c.dispose();
});

test('history-reading modal rejects background sorting without clearing bodies, chosen versions or focus', async () => {
    const f = await mount(), { c, view, doc } = f; c.select(f.records[0].id); f.at(6);
    const plan = await c.reviewBody('Second saved body'); assert.equal(await c.acceptRevision(plan), true); await tick();
    const history = view.main.querySelector('.prompt-history'); history.open = true;
    history.querySelectorAll('button').find(node => node.textContent === 'Read two saved body versions').dispatch('click');
    const overlay = doc.querySelector('.prompt-dialog-overlay'), selects = overlay.querySelectorAll('select'), bodies = overlay.querySelectorAll('pre');
    const chosen = selects.map(select => select.value), selected = c.selected, generation = c.interactionGeneration;
    selects[1].focus(); const focus = doc.activeElement; f.resetIO(); f.choose('saved');
    assert.equal(view.sortSelect.value, 'updated'); assert.equal(c.interactionGeneration, generation); assert.equal(c.selected, selected);
    assert.deepEqual(selects.map(select => select.value), chosen); bodies.forEach((body, index) => assert.equal(overlay.querySelectorAll('pre')[index], body));
    assert.equal(doc.activeElement, focus); assert.equal(view.openDialog, true); noIO(f);
    view.closeComparison(); f.choose('saved'); assert.equal(view.sortSelect.value, 'saved'); c.dispose();
});

test('valid native change fences a late capture, while invalid and unchanged values do not alter order or interaction', async () => {
    const f = await mount(), { c, view } = f;
    const { Handoff } = require('../shared/collection-capture-page'); let release, sends = 0;
    const page = new Handoff({ controller: c, search: '?capture=' + 'a'.repeat(32), clearURL() {},
        send() { sends++; return new Promise(resolve => { release = resolve; }); } });
    const pending = page.run(), generation = c.interactionGeneration, list = view.list.children.slice(); f.resetIO();
    for (const value of ['invalid', '', 'createdAt', 'updated']) {
        f.choose(value); assert.equal(view.sortSelect.value, 'updated'); assert.equal(c.interactionGeneration, generation);
        view.list.children.forEach((node, index) => assert.equal(node, list[index]));
    }
    f.choose('saved'); assert.equal(c.interactionGeneration, generation + 1);
    const selected = c.selected, main = view.main.children.slice();
    release({ ok: true, payload: { body: 'Late captured text', sourceCandidate: '' } });
    assert.equal(await pending, false); assert.equal(c.capture.error, 'guarded'); assert.equal(sends, 1);
    assert.equal(c.drafts.size, 0); assert.equal(c.selected, selected); keepMain(view, main); assert.equal(view.sortSelect.value, 'saved'); noIO(f); c.dispose();
});

test('disabled, hidden, inert, foreign-modal, detached, replaced and closed controls cannot sort', async () => {
    const f = await mount(), { c, view, doc, host } = f, select = view.sortSelect;
    const recent = titles(view), generation = c.interactionGeneration; f.resetIO();
    const rejected = () => { f.choose('saved'); assert.equal(select.value, 'updated'); assert.deepEqual(titles(view), recent); assert.equal(c.interactionGeneration, generation); };
    for (const [object, key, value] of [[c, 'busy', true], [c, 'pendingCommand', {}], [view, 'openDialog', true], [select, 'disabled', true],
        [host, 'inert', true], [host, 'hidden', true], [doc, 'visibilityState', 'hidden'], [select.style, 'display', 'none'],
        [host.style, 'visibility', 'hidden'], [host.style, 'visibility', 'collapse']]) {
        const before = object[key]; object[key] = value; rejected(); object[key] = before;
    }
    host.setAttribute('aria-hidden', 'true'); rejected(); host.removeAttribute('aria-hidden');
    const modal = doc.createElement('section'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); doc.body.append(modal); rejected(); modal.remove();
    const nativeDialog = doc.createElement('dialog'); nativeDialog.open = true; doc.body.append(nativeDialog); rejected(); nativeDialog.remove();
    const label = select.parentElement; select.remove(); rejected(); label.append(select);
    host.remove(); rejected(); doc.body.append(host);
    // A new View owns this same controller; even a still-attached old selector is stale.
    const next = new f.View({ host, controller: c }); next.render(); rejected(); assert.equal(next.sortSelect.value, 'updated');
    view.destroy(); rejected(); next.destroy(); c.dispose(); rejected(); noIO(f);
    const closed = await mount(); closed.events.get('pagehide')({ persisted: false }); const closedGeneration = closed.c.interactionGeneration;
    closed.choose('saved'); assert.equal(closed.view.sortSelect.value, 'updated'); assert.equal(closed.c.interactionGeneration, closedGeneration); closed.c.dispose();
});

test('active revision and the asynchronous review gap reject sorting without invalidating the review or losing text', async () => {
    const f = await mount(), { c, view, doc } = f; c.select(f.records[0].id);
    let release, entered;
    const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const review = f.store.reviewRevision.bind(f.store);
    f.store.reviewRevision = async input => { const plan = await review(input); entered(); await gate; return plan; };
    const pending = view.revise(c.record());
    const first = doc.querySelector('.prompt-dialog-overlay'), editor = first.querySelector('textarea'); editor.value = 'Keep exact proposed\r\nbody'; editor.dispatch('input');
    const context = view.revisionContext, generation = c.interactionGeneration; editor.focus(); f.resetIO();
    f.choose('saved'); assert.equal(view.sortSelect.value, 'updated'); assert.equal(view.revisionContext, context); assert.equal(view.revisionDraft, editor.value);
    assert.equal(doc.activeElement, editor); assert.equal(c.interactionGeneration, generation); noIO(f);
    first.querySelector('.prompt-primary').dispatch('click'); await ready;
    assert.equal(view.openDialog, false); assert.equal(doc.querySelector('.prompt-dialog-overlay'), null); f.resetIO();
    f.choose('saved'); assert.equal(view.sortSelect.value, 'updated'); assert.equal(view.revisionContext, context); assert.equal(context.current(), true);
    assert.equal(c.interactionGeneration, generation); assert.equal(view.proposals.get(c.selected), editor.value); noIO(f);
    release(); await tick(); const second = doc.querySelector('.prompt-dialog-overlay'); assert.ok(second, 'body review remains current after refused sort');
    second.querySelectorAll('button').find(node => node.textContent === 'Cancel').dispatch('click'); await pending;
    assert.equal(view.proposals.get(c.selected), editor.value); assert.equal(view.revisionContext, null); f.choose('saved'); assert.equal(view.sortSelect.value, 'saved'); c.dispose();
});

for (const locale of ['en', 'zh_CN', 'fallback']) test(`${locale} labels a native two-option sort with browser-owned keyboard behavior`, async () => {
    const f = await mount({ locale, count: 1 }), select = f.view.sortSelect;
    assert.equal(select.tagName, 'SELECT'); assert.equal(select.parentElement.tagName, 'LABEL');
    assert.equal(select.parentElement.querySelector('span').textContent, locale === 'zh_CN' ? '本页排序' : 'Sort this page');
    assert.deepEqual(select.children.map(node => node.textContent), locale === 'zh_CN' ? ['最近更新', '最早保存'] : ['Recently updated', 'Earliest saved']);
    assert.deepEqual(select.children.map(node => node.value), ['updated', 'saved']);
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ']) assert.equal(select.dispatch('keydown', { key }).prevented, false);
    f.choose('saved'); assert.equal(select.value, 'saved'); f.c.dispose();
});
