const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const { Controller } = require('../shared/local-prompts-controller.js');
const { tick, settle } = require('./helpers/prompts-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const titles = view => view.list.querySelectorAll('.prompt-card-title').map(node => node.textContent.replace(/^★ /, ''));
const ids = rows => Array.from(rows, row => row.record.id);

// Real Store/Controller, synthetic DOM and only invented local prompt records.
async function mount({ language = 'en', empty = false, clipboard } = {}) {
    let raw, serial = 0, day = 1, queue = Promise.resolve(), fail = false;
    const listeners = new Set(), calls = { read: 0, write: 0, network: 0, clipboard: 0, permission: 0 };
    const backend = {
        lock(action) { const result = queue.then(action); queue = result.catch(() => {}); return result; },
        async read() { calls.read++; return clone(raw); },
        async write(value) {
            calls.write++; raw = clone(value); for (const listener of listeners) listener();
            if (fail) { fail = false; throw new Error('synthetic uncertain write'); }
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
    };
    const store = new Core.Store(backend, { id: () => `sort_${String(++serial).padStart(8, '0')}`, now: () => new Date(Date.UTC(2026, 9, day)).toISOString() });
    const add = async (title, values = {}) => {
        const command = store.request('add', { title, body: 'Synthetic needle {{topic}}', category: 'Work', tags: ['study'], ...values });
        const state = await store.mutate(command); await tick(); day++;
        return state.records.find(record => record.id === command.operationId);
    };
    const records = [];
    if (!empty) for (const [title, favorite] of [['Zulu 10', true], ['alpha 10', false], ['Alpha 2', false], ['alpha 2', false]]) records.push(await add(title, { favorite }));
    const c = new Controller({ store }), doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'), events = new Map();
    doc.documentElement.lang = language === 'zh_CN' ? 'zh-CN' : language === 'fallback' ? '' : language;
    doc.visibilityState = 'visible'; doc.body.append(host);
    const messages = language === 'fallback' ? {} : JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`, 'utf8'));
    const root = { document: doc, LocalItabPrompts: Core, getComputedStyle: node => node.style,
        i18n: { t: key => messages[key]?.message || key },
        navigator: { clipboard: { writeText: async value => { calls.clipboard++; return clipboard?.writeText(value); } } },
        fetch: () => { calls.network++; }, chrome: { permissions: { request: () => { calls.permission++; } } },
        addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
    const collations = [], localeIntl = { DateTimeFormat: Intl.DateTimeFormat, Collator: function (...args) { collations.push(args); return new Intl.Collator(...args); } };
    const context = vm.createContext({ window: root, Intl: localeIntl, Date, Object, Array, Boolean, String, Promise });
    for (const name of ['dialog-focus', 'local-prompts-view']) vm.runInContext(fs.readFileSync(`${__dirname}/../shared/${name}.js`, 'utf8'), context);
    const View = root.LocalItabPromptsView.View, view = new View({ host, controller: c }); view.render(); await c.start(); await settle(c);
    const choose = value => { const select = view.sortSelect; assert.ok(select, 'prompt sidebar exposes a native page-local sort selector'); select.value = value; select.dispatch('change'); };
    const resetIO = () => Object.keys(calls).forEach(key => { calls[key] = 0; });
    return { c, store, backend, view, View, doc, host, events, records, add, choose, calls, collations, resetIO, raw: () => clone(raw), failOnce: () => { fail = true; } };
}
const noIO = f => assert.deepEqual(f.calls, { read: 0, write: 0, network: 0, clipboard: 0, permission: 0 });
const keepNodes = (parent, nodes) => { assert.equal(parent.children.length, nodes.length); nodes.forEach((node, index) => assert.equal(parent.children[index], node)); };

for (const language of ['en', 'zh_CN', 'fallback']) test(`${language} exposes a native two-option page-local sort control`, async () => {
    const f = await mount({ language }), { view, doc, c } = f, select = view.sortSelect;
    assert.ok(select, 'prompt sidebar exposes a native page-local sort selector');
    assert.equal(select.tagName, 'SELECT'); assert.equal(select.id, 'prompt-sort');
    assert.equal(doc.querySelector('label[for="prompt-sort"]').textContent, language === 'zh_CN' ? '本页排序' : 'Sort this page');
    assert.deepEqual(select.children.map(node => node.value), ['default', 'title']);
    assert.deepEqual(select.children.map(node => node.textContent), language === 'zh_CN' ? ['默认顺序', '标题升序'] : ['Default order', 'Title ascending']);
    assert.equal(select.value, 'default'); assert.equal(select.disabled, false);
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ']) assert.equal(select.dispatch('keydown', { key }).prevented, false);
    select.focus(); f.choose('title'); assert.equal(select.value, 'title'); assert.equal(doc.activeElement, select);
    c.dispose();
});

test('title order ignores favorite priority, uses natural numbers and stable ID ties, and leaves default results intact', async () => {
    const f = await mount(), { c, view, doc } = f;
    assert.deepEqual(titles(view), ['Zulu 10', 'alpha 2', 'Alpha 2', 'alpha 10']);
    assert.deepEqual(titles(view), c.results().map(row => row.record.title));
    const results = Object.freeze(c.results()), original = JSON.stringify(results), state = JSON.stringify(c.state), raw = f.raw();
    Object.freeze(c.state.records); c.results = () => results;
    const selected = c.selected, main = view.main.children.slice(), drafts = view.draftList.children.slice(), status = view.status.children.slice();
    const filters = c.filters, epoch = c.excerptEpoch, copy = view.copyGeneration, markdown = view.markdownGeneration;
    view.sortSelect.focus(); f.resetIO();
    f.choose('title'); assert.deepEqual(titles(view), ['Alpha 2', 'alpha 2', 'alpha 10', 'Zulu 10']);
    assert.equal(c.record(f.records[0].id).favorite, true, 'favorite remains saved but is not pinned in title mode');
    assert.deepEqual(ids(view.sortedResults()).slice(0, 2), [f.records[2].id, f.records[3].id], 'equivalent titles use ID rather than prior update order');
    assert.notEqual(view.sortedResults(), results, 'sort always returns a copy');
    assert.equal(JSON.stringify(results), original); assert.equal(JSON.stringify(c.state), state); assert.deepEqual(f.raw(), raw);
    f.choose('default'); assert.deepEqual(titles(view), results.map(row => row.record.title));
    f.choose('title'); assert.equal(c.selected, selected); assert.equal(c.filters, filters); assert.equal(c.excerptEpoch, epoch);
    assert.equal(view.copyGeneration, copy); assert.equal(view.markdownGeneration, markdown); assert.equal(doc.activeElement, view.sortSelect);
    keepNodes(view.main, main); keepNodes(view.draftList, drafts); keepNodes(view.status, status); noIO(f); c.dispose();
});

test('page language drives real collation; Unicode and HTML-like titles remain literal text', async () => {
    const f = await mount({ language: 'zh_CN', empty: true }), { c, view, doc } = f;
    for (const title of ['中 10', '中 2', '阿 1', 'éclair', 'ECLAIR', '<script>literal</script>']) await f.add(title);
    await c.refresh(); f.resetIO(); f.choose('title');
    const expected = () => c.results().slice().sort((a, b) => new Intl.Collator(doc.documentElement.lang || 'en', { sensitivity: 'base', numeric: true }).compare(a.record.title, b.record.title) || (a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0));
    assert.deepEqual(ids(view.sortedResults()), ids(expected()));
    assert.ok(titles(view).indexOf('中 2') < titles(view).indexOf('中 10'));
    assert.equal(f.collations.at(-1)[0], 'zh-CN'); assert.equal(f.collations.at(-1)[1].sensitivity, 'base'); assert.equal(f.collations.at(-1)[1].numeric, true);
    assert.equal(view.list.querySelectorAll('script, iframe, img').length, 0); assert.ok(titles(view).includes('<script>literal</script>'));
    doc.documentElement.lang = 'en'; view.renderList(); assert.equal(f.collations.at(-1)[0], 'en'); assert.deepEqual(ids(view.sortedResults()), ids(expected()));
    doc.documentElement.lang = ''; view.renderList(); assert.equal(f.collations.at(-1)[0], 'en');
    doc.documentElement.lang = 'unsupported_locale'; view.renderList(); assert.equal(f.collations.at(-1)[0], 'en');
    noIO(f); c.dispose();
});

test('sorting includes the complete query/category/tag intersection in all, favorites and Trash', async () => {
    const f = await mount(), { c, view } = f;
    await f.add('Zulu 2', { favorite: true });
    await f.add('Wrong query', { body: 'Synthetic other body' });
    await f.add('Wrong category', { category: 'Home' });
    await f.add('Wrong tag', { tags: ['other'] });
    for (const index of [1, 2]) {
        const record = c.record(f.records[index].id);
        await f.store.mutate(f.store.request('remove', { id: record.id, version: record.version })); await tick();
    }
    await c.refresh(); const raw = f.raw(), selected = c.selected; f.resetIO();
    for (const mode of ['all', 'favorites', 'trash']) for (let mask = 0; mask < 8; mask++) {
        c.filter({ mode, query: mask & 1 ? 'needle' : '', category: mask & 2 ? 'Work' : '', tag: mask & 4 ? 'study' : '' });
        const defaultRows = c.results(), snippets = new Map(defaultRows.map(row => [row.record.id, row.snippet]));
        f.choose('title');
        const sorted = view.sortedResults(); assert.deepEqual(new Set(ids(sorted)), new Set(ids(defaultRows)));
        const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
        for (let i = 1; i < sorted.length; i++) assert.ok(collator.compare(sorted[i - 1].record.title, sorted[i].record.title) <= 0);
        assert.deepEqual(view.list.querySelectorAll('.prompt-card-snippet').map(node => node.textContent), Array.from(sorted, row => snippets.get(row.record.id)));
        assert.equal(view.count.textContent, `${defaultRows.length} prompts`);
        f.choose('default'); assert.deepEqual(titles(view), defaultRows.map(row => row.record.title));
    }
    c.filter({ mode: 'all', query: 'needle', category: 'Work', tag: 'study' }); f.choose('title');
    assert.deepEqual(titles(view), ['alpha 2', 'Zulu 2', 'Zulu 10']);
    c.filter({ mode: 'favorites' }); assert.deepEqual(titles(view), ['Zulu 2', 'Zulu 10']);
    c.filter({ mode: 'trash' }); assert.deepEqual(titles(view), ['Alpha 2', 'alpha 10']);
    view.clearButton.dispatch('click'); assert.equal(view.sortSelect.value, 'title'); assert.deepEqual(c.filters, { query: '', mode: 'all', category: '', tag: '' });
    c.filter({ query: 'no such synthetic item' }); assert.deepEqual(titles(view), []); assert.equal(view.count.textContent, '0 prompts');
    assert.ok(view.list.querySelector('.prompt-no-results')); f.choose('default'); f.choose('title'); assert.equal(view.sortSelect.value, 'title');
    assert.equal(c.selected, selected); assert.deepEqual(f.raw(), raw); noIO(f); c.dispose();
});

test('empty and one-item libraries retain a reversible local choice without writes', async () => {
    const f = await mount({ empty: true }), { c, view } = f; f.resetIO();
    f.choose('title'); assert.deepEqual(titles(view), []); assert.equal(view.count.textContent, '0 prompts'); noIO(f);
    const only = await f.add('Only synthetic prompt'); await c.refresh(); f.resetIO();
    assert.equal(view.sortSelect.value, 'title'); assert.deepEqual(titles(view), [only.title]);
    f.choose('default'); f.choose('title'); assert.equal(c.selected, only.id); noIO(f); c.dispose();
});

test('the choice survives refresh, filters, record navigation and edits but a new View starts at default', async () => {
    const f = await mount(), { c, view } = f; f.choose('title');
    c.select(f.records[1].id); c.edit(); c.update('title', 'Bravo 2'); await c.save(); await settle(c);
    assert.equal(view.sortSelect.value, 'title'); assert.deepEqual(titles(view), ['Alpha 2', 'alpha 2', 'Bravo 2', 'Zulu 10']);
    await c.refresh(); assert.equal(view.sortSelect.value, 'title');
    c.filter({ mode: 'favorites', query: 'Zulu' }); view.clearButton.dispatch('click'); assert.equal(view.sortSelect.value, 'title');
    c.select(f.records[0].id); assert.equal(view.sortSelect.value, 'title');
    view.destroy(); view.shell.remove(); const next = new f.View({ host: f.host, controller: c }); next.render();
    assert.equal(next.sortSelect.value, 'default'); assert.deepEqual(titles(next), c.results().map(row => row.record.title));
    assert.equal(c.selected, f.records[0].id); c.dispose();
});

test('sort never rewrites active search or editor values and preserves exact input range and draft objects', async () => {
    const f = await mount(), { c, view, doc } = f; c.select(f.records[1].id); c.edit();
    const body = view.main.querySelector('[data-prompt-focus="body"]'); body.value = 'Unsaved\r\n{{topic}} exact body'; body.dispatch('input');
    const draft = c.draft(), ui = view.editorElements, editor = view.main.querySelector('[data-prompt-focus="body"]');
    editor.selectionStart = 3; editor.selectionEnd = 12; editor.selectionDirection = 'backward'; editor.scrollTop = 24; editor.focus();
    const main = view.main.children.slice(), drafts = view.draftList.children.slice(), raw = f.raw(); f.resetIO();
    f.choose('title'); f.choose('default'); f.choose('title');
    assert.equal(c.draft(), draft); assert.equal(view.editorElements, ui); assert.equal(editor.value, 'Unsaved\r\n{{topic}} exact body');
    assert.equal(doc.activeElement, editor); assert.equal(editor.selectionStart, 3); assert.equal(editor.selectionEnd, 12); assert.equal(editor.selectionDirection, 'backward'); assert.equal(editor.scrollTop, 24);
    keepNodes(view.main, main); keepNodes(view.draftList, drafts);
    // Model a value assignment resetting a selection: sort must never assign search.value.
    c.filter({ query: 'needle' }); let value = view.search.value, assignments = 0;
    Object.defineProperty(view.search, 'value', { configurable: true, get: () => value, set: next => { assignments++; value = next; view.search.selectionStart = 0; view.search.selectionEnd = 0; } });
    view.search.selectionStart = 1; view.search.selectionEnd = 4; view.search.selectionDirection = 'backward'; view.search.focus();
    f.choose('default'); f.choose('title'); assert.equal(assignments, 0); assert.equal(doc.activeElement, view.search);
    assert.equal(view.search.selectionStart, 1); assert.equal(view.search.selectionEnd, 4); assert.equal(view.search.selectionDirection, 'backward');
    assert.equal(c.draft(), draft); assert.deepEqual(f.raw(), raw); noIO(f); c.dispose();
});

test('saved and new-draft variable previews keep sessions, values, exact DOM and unsaved-result text', async () => {
    const f = await mount(), { c, view, doc } = f; c.setVariable('topic', 'Synthetic saved value');
    const savedSession = c.session(), savedPreview = view.previewElements, savedSelected = c.selected;
    const output = doc.createElement('textarea'); output.value = 'Synthetic unsaved AI result\r\nexact text'; view.main.append(output); output.selectionStart = 2; output.selectionEnd = 17; output.focus();
    const main = view.main.children.slice(), epoch = c.excerptEpoch; f.resetIO();
    f.choose('title'); assert.equal(c.session(), savedSession); assert.equal(c.session().values.topic, 'Synthetic saved value'); assert.equal(view.previewElements, savedPreview);
    assert.equal(c.selected, savedSelected); assert.equal(c.excerptEpoch, epoch); assert.equal(doc.activeElement, output); assert.equal(output.selectionStart, 2); assert.equal(output.selectionEnd, 17);
    assert.equal(output.value, 'Synthetic unsaved AI result\r\nexact text'); keepNodes(view.main, main);
    c.create(); c.update('title', 'Unsaved draft'); c.update('body', 'Draft {{topic}}');
    assert.equal(c.startDraftPreview(), true); c.setDraftVariable('topic', 'Synthetic draft value');
    const draft = c.draft(), session = c.draftPreview, ui = view.draftPreviewElements, elements = view.main.children.slice(), previewEpoch = c.draftPreviewEpoch;
    const input = ui.variableInputs.get('topic'); input.selectionStart = 1; input.selectionEnd = 5; input.focus();
    f.choose('default'); f.choose('title');
    assert.equal(c.draft(), draft); assert.equal(c.draftPreview, session); assert.equal(c.draftPreviewEpoch, previewEpoch); assert.equal(view.draftPreviewElements, ui);
    assert.equal(c.draftPreviewResult().text, 'Draft Synthetic draft value'); assert.ok([...c.sessions.values()].includes(savedSession)); assert.equal(savedSession.values.topic, 'Synthetic saved value');
    assert.equal(doc.activeElement, input); assert.equal(input.selectionStart, 1); assert.equal(input.selectionEnd, 5); keepNodes(view.main, elements); noIO(f); c.dispose();
});

test('open history and inline version comparison retain chosen bodies, nodes, sessions and focus', async () => {
    const f = await mount(), { c, view, doc } = f; const first = c.record().currentVersionId;
    c.edit(); c.update('body', 'Second {{topic}} synthetic body'); await c.save(); await settle(c);
    c.setVariable('topic', 'current'); assert.equal(c.useVersion(first), true); c.setVariable('topic', 'historical');
    const session = c.session(), preview = view.previewElements, history = view.main.querySelector('.prompt-history'); history.open = true;
    history.querySelector('.prompt-history-list').children[0].dispatch('click');
    history.querySelector('[data-prompt-focus="compare-open"]').dispatch('click');
    const comparison = view.comparison, comparisonPanel = history.querySelector('.prompt-comparison'), version = view.historyId;
    const field = comparisonPanel.querySelector('select'); field.focus(); const main = view.main.children.slice(), historyNodes = history.children.slice(); f.resetIO();
    f.choose('title'); f.choose('default'); assert.equal(view.historyId, version); assert.equal(view.comparison, comparison);
    assert.equal(c.session(), session); assert.equal(c.preview().text, 'Synthetic needle historical'); assert.equal(view.previewElements, preview);
    assert.equal(history.open, true); assert.equal(doc.activeElement, field); assert.equal(history.querySelector('.prompt-comparison'), comparisonPanel);
    keepNodes(view.main, main); keepNodes(history, historyNodes); noIO(f); c.dispose();
});

test('invalid, unchanged and foreign-target events are no-ops; real ownership and visibility guard stale controls', async () => {
    const f = await mount(), { c, view, doc, host } = f, select = view.sortSelect;
    const chooseOld = value => { select.value = value; select.dispatch('change'); };
    const rejected = () => {
        const list = view.list.children.slice(), epoch = c.excerptEpoch, state = JSON.stringify(c.state), focus = doc.activeElement;
        chooseOld('title'); assert.equal(select.value, 'default'); assert.equal(view.listSort, 'default');
        keepNodes(view.list, list); assert.equal(c.excerptEpoch, epoch); assert.equal(JSON.stringify(c.state), state); assert.equal(doc.activeElement, focus);
    };
    const list = view.list.children.slice(); f.resetIO();
    chooseOld('unsupported'); chooseOld(''); chooseOld('default'); keepNodes(view.list, list);
    select.value = 'title'; select.children[1].dispatch('change'); assert.equal(select.value, 'default'); keepNodes(view.list, list);
    for (const [object, key, value] of [[c, 'state', null], [c, 'busy', true], [c, 'pendingCommand', {}], [view, 'openDialog', true], [select, 'disabled', true],
        [select, 'hidden', true], [host, 'hidden', true], [host, 'inert', true], [doc, 'hidden', true], [doc, 'visibilityState', 'hidden'],
        [select.style, 'display', 'none'], [host.style, 'visibility', 'hidden'], [host.style, 'visibility', 'collapse'], [c, 'onChange', () => {}],
        [view, 'sortSelect', doc.createElement('select')]]) {
        const before = object[key]; object[key] = value; rejected(); object[key] = before;
    }
    host.setAttribute('aria-hidden', 'true'); rejected(); host.removeAttribute('aria-hidden');
    const modal = doc.createElement('section'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); doc.body.append(modal); rejected(); modal.remove();
    const dialog = doc.createElement('dialog'); dialog.open = true; doc.body.append(dialog); rejected(); dialog.remove();
    const parent = select.parentElement; select.remove(); rejected(); view.main.append(select); rejected(); select.remove(); parent.append(select);
    const sidebar = parent.parentElement; parent.remove(); view.main.append(parent); rejected(); parent.remove(); sidebar.append(parent);
    host.remove(); rejected(); doc.body.append(host);
    view.shell.remove(); doc.body.append(view.shell); rejected(); view.shell.remove(); host.append(view.shell);
    const next = new f.View({ host, controller: c }); next.render(); rejected();
    next.sortSelect.value = 'title'; next.sortSelect.dispatch('change'); assert.equal(next.sortSelect.value, 'title', 'new constructor binds its live owner after build');
    assert.deepEqual(titles(next), ['Alpha 2', 'alpha 2', 'alpha 10', 'Zulu 10']);
    view.destroy(); rejected(); next.destroy(); c.dispose(); rejected(); noIO(f);
});

test('a real confirmation modal keeps its content, context and focused control on refused background sort', async () => {
    const f = await mount(), { c, view, doc } = f; view.sortSelect.focus();
    const pending = view.dialog({ title: 'Synthetic review', body: 'Keep exact review text', accept: 'Continue' });
    const overlay = doc.querySelector('.prompt-dialog-overlay'), focus = doc.activeElement, dialogFocus = view.dialogFocus, nodes = overlay.children.slice();
    f.resetIO(); f.choose('title'); assert.equal(view.sortSelect.value, 'default'); assert.equal(view.openDialog, true);
    assert.equal(view.dialogFocus, dialogFocus); assert.equal(doc.activeElement, focus); keepNodes(overlay, nodes); noIO(f);
    overlay.querySelectorAll('button')[0].dispatch('click'); assert.equal(await pending, false);
    f.choose('title'); assert.equal(view.sortSelect.value, 'title'); c.dispose();
});

for (const persisted of [false, true]) test(`pagehide ${persisted ? 'BFCache' : 'departure'} does not revive stale sorting`, async () => {
    const f = await mount(), { c, view, events, doc } = f;
    doc.visibilityState = 'hidden'; events.get('pagehide')({ persisted }); f.resetIO();
    const draftEpoch = c.draftPreviewEpoch; f.choose('title'); assert.equal(view.sortSelect.value, 'default'); assert.equal(c.draftPreviewEpoch, draftEpoch);
    doc.visibilityState = 'visible'; f.choose('title'); assert.equal(view.sortSelect.value, persisted ? 'title' : 'default'); noIO(f); c.dispose();
});

test('busy saving and a real uncertain-save receipt remain untouched and require the original retry', async () => {
    const f = await mount(), { c, view } = f; c.edit(); c.update('body', 'Synthetic pending save');
    const gate = deferred(), entered = deferred(), write = f.backend.write;
    f.backend.write = async value => { entered.resolve(); await gate.promise; return write(value); };
    const pendingSave = c.save(); await entered.promise;
    assert.equal(c.busy, true); assert.equal(view.sortSelect.disabled, true);
    const draft = c.draft(), focus = view.pendingFocus, main = view.main.children.slice(); f.resetIO();
    f.choose('title'); assert.equal(view.sortSelect.value, 'default'); assert.equal(c.draft(), draft); assert.equal(c.busy, true); assert.equal(view.pendingFocus, focus); keepNodes(view.main, main); noIO(f);
    gate.resolve(); assert.equal(await pendingSave, true); await settle(c); f.backend.write = write;
    assert.equal(view.sortSelect.disabled, false); f.choose('title');
    c.edit(); c.update('body', 'Synthetic uncertain body'); f.failOnce(); assert.equal(await c.save(), false); await settle(c);
    assert.ok(c.pendingCommand); assert.equal(view.sortSelect.disabled, true);
    const command = c.pendingCommand, receipt = JSON.stringify(command), error = c.error, uncertainDraft = c.draft(), raw = f.raw(), status = view.status.children.slice(); f.resetIO();
    f.choose('default'); assert.equal(view.sortSelect.value, 'title'); assert.equal(c.pendingCommand, command); assert.equal(JSON.stringify(command), receipt);
    assert.equal(c.draft(), uncertainDraft); assert.equal(c.error, error); assert.deepEqual(f.raw(), raw); keepNodes(view.status, status); noIO(f);
    assert.equal(await c.retry(), true); await settle(c); assert.equal(c.pendingCommand, null); assert.equal(view.sortSelect.disabled, false);
    assert.equal(view.sortSelect.value, 'title'); c.dispose();
});

test('a delayed read keeps its original request and a later refresh retains the chosen title order', async () => {
    const f = await mount(), { c, view } = f; c.setVariable('topic', 'Synthetic retained value');
    const wait = deferred(), read = f.backend.read;
    f.backend.read = async () => { const result = await read(); await wait.promise; return result; };
    const pending = c.refresh(); await tick();
    const generation = c.pendingReadGeneration, readGeneration = c.readGeneration, session = c.session(), preview = view.previewElements, raw = f.raw(); f.resetIO();
    assert.notEqual(generation, null); f.choose('title'); assert.equal(view.sortSelect.value, 'title');
    assert.equal(c.pendingReadGeneration, generation); assert.equal(c.readGeneration, readGeneration); assert.equal(c.session(), session); assert.equal(view.previewElements, preview); noIO(f);
    wait.resolve(); await pending; f.backend.read = read;
    assert.equal(c.pendingReadGeneration, null); assert.equal(view.sortSelect.value, 'title'); assert.deepEqual(titles(view), ['Alpha 2', 'alpha 2', 'alpha 10', 'Zulu 10']);
    assert.equal(c.session(), session); assert.equal(session.values.topic, 'Synthetic retained value'); assert.deepEqual(f.raw(), raw); noIO(f); c.dispose();
});

for (const succeeds of [true, false]) test(`pending copy ${succeeds ? 'success' : 'failure'} retains its original result and destination across sorting`, async () => {
    let resolve, reject; const wait = new Promise((yes, no) => { resolve = yes; reject = no; }), copied = [];
    const f = await mount({ clipboard: { writeText(value) { copied.push(value); return wait; } } }), { c, view, doc } = f;
    c.setVariable('topic', 'Synthetic copy value'); const pending = view.copy(), ui = view.previewElements, generation = view.copyGeneration, session = c.session();
    view.sortSelect.focus(); assert.equal(view.copying, true); assert.equal(f.calls.clipboard, 1); f.resetIO();
    f.choose('title'); f.choose('default'); f.choose('title');
    assert.equal(view.previewElements, ui); assert.equal(c.session(), session); assert.equal(view.copyGeneration, generation); assert.equal(view.copying, true);
    assert.deepEqual(copied, ['Synthetic needle Synthetic copy value']); noIO(f);
    if (succeeds) resolve(); else reject(new Error('synthetic clipboard unavailable'));
    await pending; assert.equal(view.copying, false); assert.match(ui.status.textContent, succeeds ? /Copied/ : /Copy was blocked/);
    assert.equal(doc.activeElement, succeeds ? view.sortSelect : ui.preview); assert.equal(view.sortSelect.value, 'title'); noIO(f); c.dispose();
});
