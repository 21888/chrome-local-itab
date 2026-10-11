const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const api = require('../shared/local-ai-search.js');
const Prompts = require('../shared/local-prompts-controller.js');
const Collections = require('../shared/local-ai-collections-controller.js');
const { createDocument, deferred } = require('./helpers/finder-dom-model');
const record = (id, rest = {}) => ({ id, title: 'Saved', body: 'Exact <script> & {{name}}\n  text', tags: ['tag'], deletedAt: null, ...rest });
const state = (...records) => ({ revision: 1, records });
const tick = () => new Promise(setImmediate);
function store(value) { let listener; return { value, fail: false, read: async function () { if (this.fail) throw Error('secret internal error'); return this.value; }, subscribe(fn) { listener = fn; return () => { listener = null; }; }, notify() { listener?.(); } }; }

test('searches literal current title/body/tags only, labels types and sorts ties by stable ID', () => {
    const first = record('record_01', { title: 'Same', history: [{ body: 'historyonly' }], notes: 'notesonly' });
    const snapshots = { prompt: state(first, record('record_02', { title: 'Same', deletedAt: 'archived' })), collection: state(record('record_04', { title: 'Same' }), record('record_03', { title: 'Same' })) };
    const before = JSON.stringify(snapshots);
    assert.deepEqual(api.search(snapshots).map(row => [row.type, row.id]), [['collection', 'record_03'], ['collection', 'record_04'], ['prompt', 'record_01']]);
    assert.equal(api.search(snapshots, '{{NAME}}', 'prompt')[0].snippet, first.body);
    assert.equal(api.search(snapshots, '<script>')[0].field, 'body');
    assert.equal(api.search(snapshots, 'TAG')[0].field, 'tags');
    assert.equal(api.search(snapshots, 'same')[0].field, 'title');
    assert.equal(api.search(snapshots, 'historyonly').length, 0);
    assert.equal(api.search(snapshots, 'notesonly').length, 0);
    assert.equal(api.search(snapshots, 'a'.repeat(501)).length, 0);
    assert.equal(api.search(snapshots, '', 'unknown').length, 0);
    assert.equal(JSON.stringify(snapshots), before);
    const long = 'prefix '.repeat(100) + '<literal>'; const row = api.search({ prompt: state(record('record_01', { body: long })) }, '<literal>')[0];
    assert.ok(row.snippet.includes('<literal>')); assert.ok(row.snippet.startsWith('…'));
});

test('both snapshots invalidate immediately and older cross-store reads cannot win', async () => {
    const p = store(state(record('prompt_01'))), c = store(state(record('collect_01')));
    const controller = new api.Controller({ stores: { prompt: p, collection: c } }); await controller.start();
    const oldRow = controller.results('')[0]; assert.ok(controller.current(oldRow));
    const pendingP = deferred(), pendingC = deferred(); p.read = () => pendingP.promise; c.read = () => pendingC.promise;
    const oldRead = controller.refresh(); assert.equal(controller.results('').length, 0); assert.equal(controller.current(oldRow), false);
    await tick(); p.read = async () => state(record('prompt_02')); c.read = async () => state(record('collect_02'));
    p.notify(); await tick(); assert.deepEqual(controller.results('').map(row => row.id), ['collect_02', 'prompt_02']);
    pendingP.resolve(state(record('prompt_01'))); pendingC.resolve(state(record('collect_01'))); await oldRead;
    assert.deepEqual(controller.results('').map(row => row.id), ['collect_02', 'prompt_02']);
    controller.dispose(); p.notify(); assert.equal(controller.results('').length, 0);
});

test('failed library is distinct from empty; restore errors hide previous data and recover', async () => {
    const p = store(state(record('prompt_01'))), c = store(state()); const controller = new api.Controller({ stores: { prompt: p, collection: c } });
    await controller.start(); p.fail = true; p.notify(); assert.equal(controller.results('').length, 0); await tick();
    assert.deepEqual(controller.errors, { prompt: true }); assert.deepEqual(controller.snapshots.collection.records, []);
    assert.doesNotMatch(JSON.stringify(controller.errors), /secret/);
    p.fail = false; p.value = state(record('prompt_02')); await controller.refresh(); assert.equal(controller.results('')[0].id, 'prompt_02');
    const pending = deferred(); p.read = () => pending.promise; const read = controller.refresh(); controller.dispose(); pending.resolve(p.value); await read; assert.deepEqual(controller.snapshots, {});
});

test('strict navigation validates one stable ID and never substitutes another record', () => {
    assert.equal(api.href('prompt', 'prompt_01'), 'prompts.html?record=prompt_01');
    assert.equal(api.href('collection', 'collect_01'), 'collections.html?record=collect_01');
    for (const id of ['new', '', '../prompt', 'x'.repeat(101), '<script>', 'abcdefgh%']) assert.equal(api.href('prompt', id), null);
    assert.equal(api.href('evil', 'prompt_01'), null);
    assert.equal(api.target('?other=value'), null);
    for (const query of ['?record=', '?record=prompt_01&record=prompt_02', '?record=%3Cscript%3E', '?record=%00abcdefgh']) assert.equal(api.target(query).error, 'invalid');
    const s = state(record('prompt_01'), record('prompt_02', { deletedAt: 'archived' }));
    assert.deepEqual(api.resolveTarget(s, api.target('?record=prompt_01')), { id: 'prompt_01' });
    assert.equal(api.resolveTarget(s, api.target('?record=prompt_02')).error, 'archived');
    assert.equal(api.resolveTarget(s, api.target('?record=prompt_03')).error, 'missing');
});

test('both page controllers suppress default selection on invalid/missing/archived targets and retain drafts', () => {
    for (const Controller of [Prompts.Controller, Collections.Controller]) {
        for (const [query, selected, error] of [['?record=prompt_02', 'prompt_02', null], ['?record=prompt_03', '', 'missing'], ['?record=prompt_04', '', 'archived'], ['?record=bad', '', 'invalid']]) {
            const c = new Controller({ store: {} }); api.prepareTarget(c, query);
            c.accept(state(record('prompt_01'), record('prompt_02'), record('prompt_04', { deletedAt: 'archived' })));
            assert.equal(c.selected, selected); assert.equal(c.navigationError, error);
            c.drafts.set('new', { input: { title: 'keep' }, baseline: {} }); c.select('new');
            c.accept(state(record('prompt_01'))); assert.equal(c.selected, 'new'); assert.equal(c.drafts.get('new').input.title, 'keep');
        }
    }
});
function viewSetup() {
    const document = createDocument(), host = document.createElement('nav'); document.body.append(host);
    const p = store(state(record('prompt_01'))), c = store(state(record('collect_01')));
    const context = { window: null, document, LocalItabAISearch: api }; context.window = context; vm.createContext(context);
    for (const file of ['shared/dialog-focus.js', 'shared/local-ai-search-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    const view = context.LocalItabAISearchView.mount(host, { prompt: p, collection: c }); const opener = host.querySelector('button'); opener.focus(); opener.dispatch('click');
    return { document, host, view, opener, p, c, input: document.querySelector('input'), context };
}
test('dialog uses literal snippets, native exact links and keyboard navigation, Escape restores focus', async () => {
    const f = viewSetup(); await tick(); const rows = f.document.querySelectorAll('.ai-search-result');
    assert.equal(rows.length, 2); assert.equal(rows[0].href, 'collections.html?record=collect_01'); assert.equal(rows[0].target, '_blank'); assert.equal(rows[0].rel, 'noopener');
    assert.equal(rows[0].querySelector('.ai-search-snippet').textContent, 'Exact <script> & {{name}}\n  text');
    f.input.dispatch('keydown', { key: 'ArrowDown' }); assert.equal(f.document.activeElement, rows[0]);
    rows[0].dispatch('keydown', { key: 'ArrowDown' }); assert.equal(f.document.activeElement, rows[1]);
    rows[1].dispatch('keydown', { key: 'ArrowDown' }); assert.equal(f.document.activeElement, rows[0]);
    assert.equal(rows[0].dispatch('click').prevented, false);
    assert.equal(rows[0].dispatch('keydown', { key: 'Enter', repeat: true }).prevented, true);
    f.input.dispatch('keydown', { key: 'Escape', isComposing: true }); assert.ok(f.document.querySelector('.ai-search-overlay'));
    f.input.dispatch('compositionstart'); assert.equal(rows[0].dispatch('click').prevented, true);
    rows[0].dispatch('keydown', { key: 'Escape' }); assert.ok(f.document.querySelector('.ai-search-overlay'));
    f.input.dispatch('compositionend'); f.input.dispatch('keydown', { key: 'Escape' }); assert.equal(f.document.querySelector('.ai-search-overlay'), null); assert.equal(f.document.activeElement, f.opener);
    f.view.open(); await tick(); f.view.destroy(); assert.equal(f.host.children.length, 0);
});
test('filter/search empty and error states; detached stale results cannot activate', async () => {
    const f = viewSetup(); await tick(); const stale = f.document.querySelector('.ai-search-result');
    f.document.querySelector('select').value = 'prompt'; f.document.querySelector('select').dispatch('change'); assert.equal(f.document.querySelectorAll('.ai-search-result').length, 1);
    f.input.value = 'no match'; f.input.dispatch('input'); assert.equal(f.document.querySelectorAll('.ai-search-result').length, 0);
    assert.match(f.document.querySelector('[aria-live="polite"]').textContent, /No matching/);
    f.p.fail = true; f.p.notify(); assert.equal(stale.dispatch('click').prevented, true); await tick(); assert.match(f.document.querySelector('.finder-alert').textContent, /Prompt library unavailable/);
    f.view.close(); assert.equal(stale.dispatch('click').prevented, true);
});
test('unobservable sources fail closed instead of keeping unverifiable search results', async () => {
    const p = store(state(record('prompt_01'))), c = store(state()); p.subscribe = () => { throw Error('unavailable'); };
    const controller = new api.Controller({ stores: { prompt: p, collection: c } }); await controller.start();
    assert.deepEqual(controller.errors, { prompt: true }); assert.equal(controller.results('').length, 0); controller.dispose();
});
test('read failure before exact target resolution never selects the first unrelated record', async () => {
    const p = store(state(record('prompt_01'), record('prompt_02'))); p.fail = true;
    const controller = new Prompts.Controller({ store: p }); api.prepareTarget(controller, '?record=prompt_02'); await controller.start();
    assert.equal(controller.selected, ''); assert.equal(controller.state, null);
    p.fail = false; await controller.refresh(); assert.equal(controller.selected, 'prompt_02'); controller.dispose();
});
test('both library page views show explicit target errors, not the create-first empty state', () => {
    for (const [module, viewFile] of [['LocalItabPromptsView', 'shared/local-prompts-view.js'], ['LocalItabCollectionsView', 'shared/local-ai-collections-view.js']]) {
        const document = createDocument(), host = document.createElement('div'); document.body.append(host);
        const context = { window: null, document, LocalItabPrompts: require('../shared/local-prompts-store.js'), LocalItabAICollections: require('../shared/local-ai-collections-store.js') }; context.window = context; vm.createContext(context);
        for (const file of ['shared/local-ai-search-view.js', viewFile]) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
        const c = module === 'LocalItabPromptsView' ? new Prompts.Controller({ store: {} }) : new Collections.Controller({ store: {} });
        api.prepareTarget(c, '?record=does_not_exist'); c.accept((module === 'LocalItabPromptsView' ? context.LocalItabPrompts : context.LocalItabAICollections).initial());
        const view = new context[module].View({ host, controller: c }); view.render();
        assert.match(view.main.querySelector('.prompt-conflict').textContent, /no longer available/);
        assert.equal(c.selected, '');
    }
});
test('runtime wiring, locales and search remain read-only and packageable', () => {
    const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const source = read('shared/local-ai-search.js') + read('shared/local-ai-search-view.js') + read('local-ai-search.js');
    assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|innerHTML|\.mutate\(|\.set\(|storage\.local|navigator\.clipboard|createChromeBackend/);
    assert.match(source, /textContent/); assert.match(source, /LocalItabDialog.open/);
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
        for (const key of ['Open', 'Scope', 'Query', 'Filter', 'All', 'Prompt', 'Collection', 'Loading', 'Empty', 'None', 'PromptError', 'CollectionError', 'Partial', 'Unavailable', 'Retry', 'Clear', 'Close', 'Results', 'Body', 'Title', 'Tags', 'Invalid', 'Missing', 'Archived']) assert.ok(messages[`aiSearch${key}`]?.message, `${locale} ${key}`);
    }
    for (const file of ['local-ai-search.js', 'shared/local-ai-search.js', 'shared/local-ai-search-view.js']) assert.ok(read('tools/package_extension.py').includes(`"${file}"`));
    for (const page of ['prompts', 'collections']) {
        const html = read(`${page}.html`); assert.ok(html.indexOf('shared/local-ai-search.js') < html.indexOf(`src="${page}.js"`));
        const script = read(`${page}.js`); assert.ok(script.indexOf('prepareTarget') < script.indexOf('await controller.start()'));
    }
});
test('a delayed initial target read cannot steal newer draft or record selection', async () => {
    for (const Controller of [Prompts.Controller, Collections.Controller]) {
        for (const action of ['draft', 'select']) {
            const pending = deferred(), source = store(); source.read = () => pending.promise;
            const c = new Controller({ store: source }); api.prepareTarget(c, '?record=prompt_01'); const started = c.start();
            if (action === 'draft') { c.create(); c.update('title', 'Keep this draft'); }
            else c.select('prompt_02');
            const selected = c.selected;
            pending.resolve(state(record('prompt_01'), record('prompt_02'))); await started;
            assert.equal(c.selected, selected);
            if (action === 'draft') assert.equal(c.draft().input.title, 'Keep this draft');
            c.dispose();
        }
    }
});
test('lost compositionend commits filtering on focusout and fresh links can activate', async () => {
    const f = viewSetup(); await tick();
    f.input.dispatch('compositionstart'); f.input.value = 'missing literal'; f.input.dispatch('input');
    assert.equal(f.document.querySelectorAll('.ai-search-result').length, 2);
    f.input.dispatch('focusout'); assert.equal(f.document.querySelectorAll('.ai-search-result').length, 0);
    f.input.focus(); f.input.value = 'Exact'; f.input.dispatch('input');
    const link = f.document.querySelector('.ai-search-result'); assert.ok(link); assert.equal(link.dispatch('click').prevented, false);
    f.input.dispatch('keydown', { key: 'Escape' }); assert.equal(f.document.activeElement, f.opener); f.view.destroy();
});
test('snippet offsets preserve Unicode after case-fold expansion before the match', () => {
    const body = 'İ'.repeat(500) + 'needle 😀';
    const row = api.search({ prompt: state(record('prompt_01', { body })) }, 'needle')[0];
    assert.ok(row.snippet.includes('needle 😀'));
    assert.equal(row.snippet, '…' + 'İ'.repeat(45) + 'needle 😀');
});
