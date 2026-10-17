const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store');
const Context = require('../shared/ai-context');
const { setup, add, tick } = require('./helpers/collections-harness');
const { createDocument } = require('./helpers/task-dom-model');
const title = 'Read two saved body versions';
const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
const display = value => value.replace(/\r\n?/g, '\n');

async function mount({ locale = 'en', count = 2 } = {}) {
    const h = setup(), c = h.controller, doc = createDocument({ blurUnavailableFocus: true }), events = new Map();
    const host = doc.createElement('main'); doc.body.append(host);
    const messages = locale === 'fallback' ? {} : JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const calls = { read: 0, write: 0, network: 0, clipboard: 0, grant: 0 };
    const root = { document: doc, LocalItabAICollections: Core, i18n: { t: key => messages[key]?.message || key },
        addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key),
        fetch: () => { calls.network++; }, navigator: { clipboard: { writeText: () => { calls.clipboard++; } } },
        chrome: { permissions: { request: () => { calls.grant++; } } } };
    const context = vm.createContext({ window: root });
    for (const file of ['dialog-focus', 'local-ai-collections-view']) vm.runInContext(fs.readFileSync(`shared/${file}.js`, 'utf8'), context);
    const view = new root.LocalItabCollectionsView.View({ host, controller: c }); await c.start();
    const packed = Context.pack('Synthetic question', [{ id: 'collection:synthetic', label: 'Synthetic source', text: 'Snapshot-only text' }]);
    const cmd = h.store.request('add', { title: 'History <script>literal</script>', body: 'first\r\nsecond\rthird\n  中文 😀\t', notes: 'Retain annotations', sourceUrl: 'https://source.example/item', tool: 'Synthetic tool', tags: ['history'], promptRef: { promptId: 'prompt_0001', bodyVersionId: 'version_0001' },
        contextSnapshot: { schemaVersion: 1, question: packed.question, sources: packed.sources, prompt: packed.prompt, endpoint: 'https://provider.example/v1/chat/completions', model: 'synthetic' } });
    await h.store.mutate(cmd); await tick(); const id = cmd.operationId;
    const revise = async body => { const record = c.record(id); await h.store.mutate(h.store.request('revise', await h.store.reviewRevision({ id, version: record.version, body }))); await tick(); };
    for (let i = 1; i < count; i++) await revise(`<img src=x onerror=bad>\nVersion ${i + 1}\r\n`);
    const b = await add(c, 'Other collection', 'Other saved body'); c.select(id);
    for (const key of ['read', 'write']) { const original = h.backend[key].bind(h.backend); h.backend[key] = (...args) => { calls[key]++; return original(...args); }; }
    const trigger = () => view.main.querySelector('.prompt-history')?.querySelectorAll('button').find(node => node.textContent === (messages.collectionsHistoryCompare?.message || title));
    const open = () => {
        const button = trigger(); assert.ok(button, 'active saved history has a reading entry'); button.parentElement.open = true; button.focus(); button.dispatch('click');
        const overlay = doc.querySelector('.prompt-dialog-overlay'); assert.ok(overlay, 'history reading dialog opens');
        return { button, overlay, selectors: overlay.querySelectorAll('select'), bodies: () => overlay.querySelectorAll('pre') };
    };
    const choose = (d, side, value) => { d.selectors[side].value = value; d.selectors[side].dispatch('change'); };
    return { h, c, view, doc, host, root, events, calls, id, b, revise, trigger, open, choose };
}

test('two saved versions open as literal keyboard-readable columns without any IO or metadata changes', async () => {
    const f = await mount(), { c, view, id } = f, record = c.record(id);
    view.proposals.set(id, 'Unsaved proposal'); c.edit(f.b.id); c.update('body', 'Other unsaved draft'); const draft = c.draft(); c.select(id);
    const state = JSON.stringify(c.state), writes = f.h.writes; Object.keys(f.calls).forEach(key => { f.calls[key] = 0; });
    const d = f.open(); d.button.dispatch('click'); assert.equal(f.doc.querySelectorAll('.prompt-dialog-overlay').length, 1);
    assert.equal(d.selectors.length, 2); assert.deepEqual(d.selectors.map(node => node.value), record.history.map(v => v.id));
    for (const select of d.selectors) assert.deepEqual(select.children.map(node => node.value), record.history.map(v => v.id));
    assert.deepEqual(d.bodies().map(node => node.textContent), record.history.map(v => display(v.body)));
    assert.ok(d.bodies().every(node => node.tabIndex === 0)); assert.equal(d.overlay.querySelectorAll('script, img, a, iframe').length, 0);
    assert.match(text(d.overlay), /not a line-by-line diff/); assert.match(text(d.overlay), /CRLF, CR or LF/); assert.match(text(d.overlay), /Current/);
    assert.ok(text(d.overlay).includes(record.history[0].id)); assert.ok(text(d.overlay).includes(record.history[1].id));
    assert.doesNotMatch(text(d.overlay), /Snapshot-only text|Synthetic question|Unsaved proposal|Other unsaved draft/);
    assert.deepEqual(d.overlay.querySelectorAll('button').map(node => node.textContent), ['Close comparison']);
    const close = d.overlay.querySelector('button'); close.focus(); close.dispatch('keydown', { key: 'Tab' }); assert.equal(f.doc.activeElement, d.selectors[0]);
    d.selectors[0].dispatch('keydown', { key: 'Escape', isComposing: true }); assert.equal(view.openDialog, true);
    d.selectors[0].dispatch('keydown', { key: 'Escape' }); assert.equal(view.openDialog, false); assert.equal(f.doc.activeElement, d.button);
    assert.equal(JSON.stringify(c.state), state); assert.equal(f.h.writes, writes); assert.equal(c.drafts.get(f.b.id), draft); assert.equal(view.proposals.get(id), 'Unsaved proposal');
    assert.deepEqual(f.calls, { read: 0, write: 0, network: 0, clipboard: 0, grant: 0 }); c.dispose();
});

test('refresh clears history before await and a failed read cannot reopen through select error clearing', async () => {
    const f = await mount(), d = f.open(), read = f.h.store.read.bind(f.h.store); let reject;
    f.h.store.read = () => new Promise((_, no) => { reject = no; }); const pending = f.c.refresh();
    assert.equal(d.bodies().length, 0); assert.ok(d.selectors.every(node => node.disabled));
    reject(new Error('synthetic read failed')); await pending; f.view.closeComparison(); f.c.select(f.b.id); f.c.select(f.id);
    assert.equal(f.c.error, null); assert.equal(f.trigger().disabled, true); f.trigger().dispatch('click'); assert.equal(f.doc.querySelector('.prompt-dialog-overlay'), null);
    f.h.store.read = read; await f.c.refresh(); const next = f.open(); assert.equal(next.bodies().length, 2); f.c.dispose();
});

test('twenty-version history offers exact same-record IDs, defaults to latest two and can read the oldest', async () => {
    const f = await mount({ count: 20 }), versions = f.c.record().history, d = f.open();
    assert.deepEqual(d.selectors.map(node => node.value), versions.slice(-2).map(v => v.id));
    for (const select of d.selectors) {
        assert.deepEqual(select.children.map(node => node.value), versions.map(v => v.id));
        assert.match(select.children[0].textContent, /^1 · /); assert.match(select.children[19].textContent, /^20 · .*Current/);
        assert.equal(select.children.filter(node => node.textContent.includes('Current')).length, 1);
    }
    f.choose(d, 0, versions[0].id); f.choose(d, 1, versions[19].id);
    assert.deepEqual(d.bodies().map(node => node.textContent), [display(versions[0].body), display(versions[19].body)]);
    f.c.filter({ query: 'nothing', tag: 'absent', type: 'code', tool: 'absent' });
    assert.equal(d.bodies().length, 2); assert.ok(d.selectors.every(node => !node.disabled));
    f.c.dispose();
});

test('raw equality distinguishes different IDs and normalized-looking text; same-ID selection is explicit', async () => {
    const f = await mount(), original = f.c.record().history[0]; await f.revise(original.body);
    const d = f.open(), restored = f.c.record().history[2]; f.choose(d, 0, original.id); f.choose(d, 1, restored.id);
    assert.notEqual(original.id, restored.id); assert.match(text(d.overlay), /exactly identical/);
    f.choose(d, 0, restored.id); assert.match(text(d.overlay), /same saved version is selected on both sides/);
    f.view.closeComparison(); await f.revise(display(original.body)); const normalized = f.c.record().history[3], next = f.open();
    f.choose(next, 0, original.id); f.choose(next, 1, normalized.id);
    assert.equal(next.bodies()[0].textContent, next.bodies()[1].textContent); assert.match(text(next.overlay), /not exactly identical/);
    assert.equal(f.c.record().history[0].body, original.body); f.c.dispose();
});

test('one saved version and archived records have no history reading entry', async () => {
    const f = await mount({ count: 1 }); assert.equal(f.trigger(), undefined);
    await f.revise('Second saved version'); assert.ok(f.trigger()); const record = f.c.record();
    await f.h.store.mutate(f.h.store.request('remove', { id: record.id, version: record.version })); await tick();
    assert.equal(f.trigger(), undefined); f.c.dispose();
});

test('missing, foreign and recovery-only history IDs clear both columns without substituting a version', async () => {
    const f = await mount();
    const recoveryOnly = 'recovery_version_0001';
    f.c.state.recovery.push({ content: { records: [{ id: f.id, history: [{ id: recoveryOnly, body: 'Recovery-only body' }] }] } });
    for (const invalid of ['missing', f.b.history[0].id, recoveryOnly]) {
        const d = f.open(); f.choose(d, 1, invalid);
        assert.equal(d.bodies().length, 0); assert.ok(d.selectors.every(node => node.disabled)); assert.match(text(d.overlay), /comparison has been cleared/);
        f.choose(d, 1, f.c.record().history[1].id); assert.equal(d.bodies().length, 0); f.view.closeComparison();
    }
    f.c.dispose();
});

test('selected history-body or source-version mutation is rejected even when state and record identity remain', async () => {
    const f = await mount(), record = f.c.record(), d = f.open(); record.history[0].body = 'Changed raw historical text'; f.view.updateComparison();
    assert.equal(d.bodies().length, 0); f.view.closeComparison(); await f.c.refresh();
    const next = f.open(); f.c.record().version++; f.view.updateComparison(); assert.equal(next.bodies().length, 0); f.c.dispose();
});

test('direct rerender and A to B to A fence old openers even if their DOM is reattached', async () => {
    const f = await mount(), d = f.open(); f.view.render(); assert.equal(d.bodies().length, 0); f.view.closeComparison();
    f.view.main.append(d.button); d.button.dispatch('click'); assert.equal(f.doc.querySelector('.prompt-dialog-overlay'), null);
    const next = f.open(); f.c.select(f.b.id); f.c.select(f.id); assert.equal(next.bodies().length, 0); f.view.closeComparison();
    f.view.main.append(next.button); next.button.dispatch('click'); assert.equal(f.doc.querySelector('.prompt-dialog-overlay'), null); f.c.dispose();
});

test('old chooser and cleanup callbacks cannot revive text or take ownership from another modal', async () => {
    const f = await mount(), old = f.open(), oldUpdate = f.view.updateComparison, oldClose = f.view.closeComparison;
    f.view.closeComparison(); const next = f.open(), nextClose = f.view.closeComparison; oldUpdate(); oldClose(); f.choose(old, 1, f.c.record().history[0].id);
    assert.equal(old.bodies().length, 0); assert.equal(next.bodies().length, 2); assert.equal(f.view.closeComparison, nextClose);
    f.view.closeComparison(); f.view.compareSaved(f.id, 'manual'); const crossClose = f.view.closeComparison;
    oldUpdate(); oldClose(); old.button.dispatch('click'); assert.equal(f.view.closeComparison, crossClose); assert.equal(f.doc.querySelectorAll('.prompt-dialog-overlay').length, 1);
    f.c.dispose();
});

test('closing stale history preserves focus owned by a newer editor even with an old opener reattached', async () => {
    const f = await mount(), d = f.open(); f.c.select(f.b.id); f.c.edit(); f.c.update('notes', 'Keep this editor');
    const editor = f.view.editor.fields.notes, draft = f.c.draft();
    // Model a newer owner that has taken the background out of inert mode.
    f.host.inert = false; f.view.main.append(d.button); editor.focus(); assert.equal(f.doc.activeElement, editor);
    f.view.closeComparison(); assert.equal(f.doc.activeElement, editor); assert.equal(f.c.draft(), draft); assert.equal(draft.input.notes, 'Keep this editor'); f.c.dispose();
});

test('busy, uncertain-save and editing states clear history and prevent reopening', async () => {
    const f = await mount(), d = f.open(); f.c.busy = true; f.c.notify(); assert.equal(d.bodies().length, 0); f.view.closeComparison();
    assert.equal(f.trigger().disabled, true); f.trigger().dispatch('click'); assert.equal(f.doc.querySelector('.prompt-dialog-overlay'), null);
    f.c.busy = false; f.c.pendingCommand = { action: 'save', command: { kind: 'edit', id: f.id }, draftKey: f.id }; f.c.notify();
    assert.equal(f.trigger().disabled, true); f.trigger().dispatch('click'); assert.equal(f.doc.querySelector('.prompt-dialog-overlay'), null);
    f.c.pendingCommand = null; f.c.notify(); const next = f.open(); f.c.edit(); assert.equal(next.bodies().length, 0); f.view.closeComparison(); assert.equal(f.trigger(), undefined); f.c.dispose();
});

test('out-of-order reads cannot restore cleared bodies or change a newer history selection', async () => {
    const f = await mount(), d = f.open(), read = f.h.store.read.bind(f.h.store), old = f.c.state; let resolve;
    f.h.store.read = () => new Promise(done => { resolve = done; }); const pending = f.c.refresh(); f.h.store.read = read;
    await f.c.refresh(); resolve(old); await pending; assert.equal(d.bodies().length, 0); assert.ok(d.selectors.every(node => node.disabled));
    f.view.closeComparison(); const next = f.open(); f.choose(d, 0, old.records.find(r => r.id === f.id).history[1].id);
    assert.equal(next.bodies().length, 2); assert.notEqual(next.selectors[0].value, next.selectors[1].value); f.c.dispose();
});

for (const cause of ['archive', 'replacement', 'bfcache', 'pagehide', 'destroy']) test(`${cause} clears saved-history reading and old reconnected controls cannot revive it`, async () => {
    const f = await mount(), d = f.open(), record = f.c.record();
    if (cause === 'archive') { await f.h.store.mutate(f.h.store.request('remove', { id: record.id, version: record.version })); await tick(); }
    if (cause === 'replacement') { const backup = await f.h.store.export(); await f.h.store.mutate(f.h.store.request('replace', await f.h.store.review(backup))); await tick(); }
    if (cause === 'bfcache') { f.events.get('pagehide')({ persisted: true }); f.events.get('pageshow')({ persisted: true }); }
    if (cause === 'pagehide') f.events.get('pagehide')({ persisted: false });
    if (cause === 'destroy') f.view.destroy();
    assert.equal(d.bodies().length, 0); assert.ok(d.selectors.every(node => node.disabled)); f.view.closeComparison?.();
    f.doc.body.append(d.overlay); f.choose(d, 0, record.history[1].id); assert.equal(d.bodies().length, 0); d.overlay.remove();
    f.view.main.append(d.button); d.button.dispatch('click'); assert.equal(f.doc.querySelector('.prompt-dialog-overlay'), null); assert.equal(f.host.inert, false); f.c.dispose();
});

for (const locale of ['zh_CN', 'fallback']) test(`${locale} supplies explicit history-reading labels and scope`, async () => {
    const f = await mount({ locale }), d = f.open();
    assert.match(text(d.overlay), locale === 'zh_CN' ? /并排阅读两个已保存正文版本/ : /Read two saved body versions/);
    assert.match(text(d.overlay), locale === 'zh_CN' ? /逐行增删/ : /not a line-by-line diff/); f.c.dispose();
});

test('saved-history reading reuses the existing bounded two-column and narrow stacked layout', () => {
    const css = fs.readFileSync('collections.css', 'utf8');
    assert.match(css, /collection-comparison-grid[^}]+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /collection-comparison-grid \.prompt-readonly[^}]+max-height: 45vh; overflow: auto; white-space: pre-wrap/);
    assert.match(css, /@media \(max-width: 700px\)[^\n]+grid-template-columns: minmax\(0, 1fr\)/);
});
