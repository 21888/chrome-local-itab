const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store');
const { Controller } = require('../shared/local-ai-collections-controller');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const { tick } = require('./helpers/collections-harness');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// A real Store/Controller, controlled save dates and a synthetic DOM/download sink.
// No shared fixture, existing assertion or browser/download implementation is altered.
async function mount({ count = 3, locale = 'en', body } = {}) {
    let raw, serial = 0, date = 0, queue = Promise.resolve();
    const calls = { read: 0, write: 0, network: 0, clipboard: 0, permission: 0 }, listeners = new Set();
    const backend = {
        lock(action) { const task = queue.then(action); queue = task.catch(() => {}); return task; },
        async read() { calls.read++; return clone(raw); },
        async write(value) { calls.write++; raw = clone(value); for (const fn of listeners) fn(); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    const store = new Core.Store(backend, { id: () => `export_${String(++serial).padStart(8, '0')}`, now: () => new Date(Date.UTC(2026, 9, 1, 0, 0, ++date)).toISOString() });
    const add = async (title, values = {}) => {
        const command = store.request('add', { title, body: body || `needle ${title}`, type: 'code', tool: 'Example', tags: ['exact,中文'], ...values });
        const next = await store.mutate(command); await tick(); return next.records.find(record => record.id === command.operationId);
    };
    const records = [];
    for (let i = 0; i < count; i++) records.push(await add(`Saved ${i + 1}`));
    const c = new Controller({ store }), doc = createDocument({ blurUnavailableFocus: true }), events = new Map();
    const host = doc.createElement('main'); doc.body.append(host);
    const downloads = { blobs: [], clicks: [], revoked: [], anchors: [] };
    const messages = locale === 'fallback' ? {} : JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const root = { document: doc, LocalItabAICollections: Core, i18n: { t: key => messages[key]?.message || key }, Blob,
        getComputedStyle: node => node.style, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name),
        navigator: { clipboard: { writeText() { calls.clipboard++; } } }, fetch() { calls.network++; },
        chrome: { permissions: { request() { calls.permission++; } } }, location: { assign() {} },
        URL: { createObjectURL(blob) { downloads.blobs.push(blob); return `blob:results-${downloads.blobs.length}`; }, revokeObjectURL(url) { downloads.revoked.push(url); } } };
    const create = doc.createElement;
    doc.createElement = tag => {
        const node = create(tag);
        if (tag === 'a') { downloads.anchors.push(node); node.click = () => downloads.clicks.push({ href: node.href, name: node.download, connected: node.isConnected }); }
        return node;
    };
    const context = vm.createContext({ window: root });
    for (const filename of ['dialog-focus', 'local-ai-markdown', 'local-ai-collections-view']) vm.runInContext(fs.readFileSync(`shared/${filename}.js`, 'utf8'), context);
    const View = root.LocalItabCollectionsView.View, view = new View({ host, controller: c }); view.attachDepartureGuard(); await c.start();
    const reset = () => Object.keys(calls).forEach(key => { calls[key] = 0; });
    const choose = value => { view.sortSelect.value = value; view.sortSelect.dispatch('change'); };
    return { c, store, backend, view, View, doc, host, events, root, calls, downloads, records, add, reset, choose, raw: () => clone(raw) };
}
const noIO = f => assert.deepEqual(f.calls, { read: 0, write: 0, network: 0, clipboard: 0, permission: 0 });
const review = f => { const gate = deferred(), seen = []; f.view.dialog = options => { seen.push(options); return gate.promise; }; return { ...gate, seen }; };
const savedOrder = f => f.view.list.querySelectorAll('.prompt-card-title').map(node => node.textContent);
const getText = async f => { assert.equal(f.downloads.blobs[0].type, 'text/markdown;charset=utf-8'); return f.downloads.blobs[0].text(); };

test('list-adjacent export reviews every matching saved result in the current list order, then explicitly requests one download', async () => {
    const f = await mount(), { c, view, downloads } = f;
    assert.ok(view.resultMarkdownButton, 'the results list exposes its own Markdown export button');
    assert.equal(view.resultMarkdownButton.parentElement, view.list.parentElement);
    assert.equal(view.resultMarkdownButton.disabled, false);
    const detail = view.main.children.slice(), state = f.raw(), selected = c.selected, r = review(f); f.reset();
    view.resultMarkdownButton.dispatch('click'); await tick();
    assert.equal(r.seen.length, 1); assert.equal(downloads.blobs.length, 0);
    const options = r.seen[0]; assert.match(options.body, /3 items/); assert.match(options.body, /Saved/); assert.match(options.body, /Recently updated/);
    assert.match(options.body, /private information/); assert.match(options.body, /not a recovery backup/);
    let previous = -1;
    for (const title of savedOrder(f)) { const index = options.markdownPreview.indexOf(title); assert.ok(index > previous); previous = index; }
    for (const record of c.results().map(result => result.record)) assert.ok(options.markdownPreview.includes(f.root.LocalItabAIMarkdown.serialize('collection', record)));
    r.resolve(true); await tick();
    assert.equal(await getText(f), options.markdownPreview);
    assert.deepEqual(downloads.clicks, [{ href: 'blob:results-1', name: 'local-itab-collection-results.md', connected: true }]);
    assert.deepEqual(downloads.revoked, ['blob:results-1']); assert.equal(downloads.anchors.some(node => node.download && node.isConnected), false);
    assert.match(view.status.textContent, /Download requested/); assert.equal(c.selected, selected);
    detail.forEach((node, i) => assert.equal(view.main.children[i], node)); assert.deepEqual(f.raw(), state); noIO(f); c.dispose();
});

test('zero filtered results cannot open an export review or create a file', async () => {
    const f = await mount(), { c, view } = f;
    assert.ok(view.resultMarkdownButton, 'the results list exposes its own Markdown export button');
    c.filter({ query: 'no match' }); assert.equal(view.resultMarkdownButton.disabled, true);
    const r = review(f); f.reset(); view.resultMarkdownButton.dispatch('click'); await view.exportResultsMarkdown();
    assert.equal(r.seen.length, 0); assert.equal(f.downloads.blobs.length, 0); noIO(f); c.dispose();
});

async function change(f, record, kind, values = {}) {
    const current = f.c.record(record.id);
    const input = { id: current.id, version: current.version, ...values };
    const command = f.store.request(kind, kind === 'revise' ? await f.store.reviewRevision(input) : input);
    await f.store.mutate(command); await tick(); return f.c.record(record.id);
}

test('query/type/tool/exact tag and saved/archive scopes intersect; both orders include all matches beyond the modeled viewport', async () => {
    const f = await mount(), { c, view } = f;
    await f.add('Wrong query', { body: 'unrelated' });
    await f.add('Wrong type', { type: 'answer' });
    await f.add('Wrong tool', { tool: 'Other' });
    await f.add('Wrong tag', { tags: ['exact,中文-extra'] });
    const archived = await f.add('Archived match'); await change(f, archived, 'remove');
    await change(f, f.records[0], 'edit', { notes: 'changed annotation' });
    c.filter({ query: 'needle', type: 'code', tool: 'Example', tag: 'exact,中文' });
    assert.deepEqual(savedOrder(f), ['Saved 1', 'Saved 3', 'Saved 2']);
    const savedFilters = clone(c.filters); f.reset();
    for (const sort of ['saved', 'updated']) {
        f.choose(sort); const expected = savedOrder(f), r = review(f), pending = view.exportResultsMarkdown();
        // Even a short viewport cannot reduce the underlying result set.
        view.list.style.maxHeight = '1px'; view.list.scrollTop = 900;
        assert.equal(r.seen.length, 1); const options = r.seen[0];
        let last = -1; for (const title of expected) { const index = options.markdownPreview.indexOf(title); assert.ok(index > last); last = index; }
        for (const excluded of ['Wrong query', 'Wrong type', 'Wrong tool', 'Wrong tag', 'Archived match']) assert.equal(options.markdownPreview.includes(excluded), false);
        assert.ok(options.body.includes('exact,中文')); assert.ok(options.body.includes('Example')); r.resolve(false); await pending;
    }
    c.filter({ mode: 'trash' }); const r = review(f), pending = view.exportResultsMarkdown();
    assert.match(r.seen[0].body, /1 items · Archived/); assert.match(r.seen[0].markdownPreview, /Archived match/);
    assert.doesNotMatch(r.seen[0].markdownPreview, /Saved [123]/); r.resolve(true); await pending;
    c.clearFilters(); assert.equal(view.sortSelect.value, 'updated'); assert.equal(c.filters.mode, 'trash');
    assert.deepEqual(savedFilters, { query: 'needle', mode: 'all', type: 'code', tool: 'Example', tag: 'exact,中文' }); noIO(f); c.dispose();
});

test('saved literals and reference IDs survive; metadata/new drafts, proposals, source, history, recovery and context never enter the output', async () => {
    const f = await mount({ count: 0 }), { c, view } = f;
    const Context = require('../shared/ai-context');
    const packed = Context.pack('CONTEXT_QUESTION_SECRET', [{ id: 'synthetic-source', label: 'Source', text: 'CONTEXT_SOURCE_SECRET' }]);
    const body = '  literal 中文 🧪\r\n<script>literal()</script>\r```\n```````\n\\path\t  ', notes = 'Private text stays literal\r\n  <em>注释</em>  ';
    const record = await f.add('Saved <img src=x> title', { body: 'HISTORY_BODY_SECRET', notes, sourceUrl: 'https://source.example/SOURCE_URL_SECRET', promptRef: { promptId: 'exact_prompt_01', bodyVersionId: 'exact_body_01' },
        contextSnapshot: { schemaVersion: 1, question: packed.question, sources: packed.sources, prompt: packed.prompt, endpoint: 'https://endpoint.example/v1/chat/completions', model: 'synthetic' } });
    await change(f, record, 'revise', { body });
    // Build a valid recovery copy through the Store's reviewed replacement path.
    const beforeReplacement = await f.store.export();
    await f.add('RECOVERY_ONLY_SECRET', { body: 'RECOVERY_BODY_SECRET' });
    const plan = await f.store.review(beforeReplacement); await f.store.mutate(f.store.request('replace', plan)); await tick();
    assert.ok(c.state.recovery.length > 0);
    c.select(record.id); c.edit();
    view.editor.fields.title.value = 'DRAFT_TITLE_SECRET'; view.editor.fields.title.dispatch('input');
    const notesInput = view.editor.fields.notes; notesInput.value = 'DRAFT_NOTES_SECRET'; notesInput.dispatch('input');
    const metadataDraft = c.draft();
    view.proposals.set(record.id, 'PROPOSAL_BODY_SECRET');
    c.create(); c.update('title', 'NEW_TITLE_SECRET'); c.update('body', 'NEW_BODY_SECRET'); const newDraft = c.draft(); c.select(record.id);
    const state = f.raw(), drafts = JSON.stringify([...c.drafts]), r = review(f); f.reset();
    const pending = view.exportResultsMarkdown(); const preview = r.seen[0].markdownPreview;
    assert.ok(preview.includes(body)); assert.ok(preview.includes(notes)); assert.ok(preview.includes('exact_prompt_01')); assert.ok(preview.includes('exact_body_01'));
    for (const forbidden of ['HISTORY_BODY_SECRET', 'DRAFT_TITLE_SECRET', 'DRAFT_NOTES_SECRET', 'PROPOSAL_BODY_SECRET', 'NEW_TITLE_SECRET', 'NEW_BODY_SECRET', 'SOURCE_URL_SECRET', 'CONTEXT_QUESTION_SECRET', 'CONTEXT_SOURCE_SECRET', 'endpoint.example', 'RECOVERY_ONLY_SECRET', 'RECOVERY_BODY_SECRET']) assert.equal(preview.includes(forbidden), false, forbidden);
    assert.equal(r.seen[0].sourceCheckbox, undefined); assert.equal(r.seen[0].checkbox, undefined);
    r.resolve(true); await pending; assert.equal(await getText(f), preview);
    assert.equal(c.drafts.get(record.id), metadataDraft); assert.equal(c.drafts.get('new'), newDraft); assert.equal(JSON.stringify([...c.drafts]), drafts);
    assert.equal(view.proposals.get(record.id), 'PROPOSAL_BODY_SECRET'); assert.deepEqual(f.raw(), state); noIO(f);
    // Editing still has its original metadata value after the independent export.
    assert.equal(c.draft().input.notes, 'DRAFT_NOTES_SECRET'); assert.equal(notesInput.value, 'DRAFT_NOTES_SECRET'); c.dispose();
});

test('the owned review preserves detail/history and restores focus, supports IME Escape, and rejects duplicate or old callbacks', async () => {
    const f = await mount(), { c, view, doc } = f;
    const history = view.main.querySelector('.prompt-history'); history.open = true; const historyBody = history.querySelector('pre'); historyBody.scrollTop = 37;
    const detail = view.main.children.slice(), selected = c.selected; view.resultMarkdownButton.focus(); f.reset();
    const first = view.exportResultsMarkdown(), overlay = doc.querySelector('.prompt-dialog-overlay'), oldCancel = view.cancelMarkdownDialog;
    assert.ok(overlay); assert.equal(f.host.inert, true); assert.equal(doc.activeElement, overlay.querySelector('h2'));
    overlay.querySelector('h2').dispatch('keydown', { key: 'Tab', shiftKey: true }); assert.equal(doc.activeElement, overlay.querySelector('.prompt-primary'));
    assert.equal(overlay.querySelector('pre').tabIndex, 0); assert.equal(overlay.querySelectorAll('input, textarea, a, script, img').length, 0);
    await view.exportResultsMarkdown(); assert.equal(doc.querySelectorAll('.prompt-dialog-overlay').length, 1);
    overlay.querySelector('pre').focus(); overlay.dispatch('compositionstart', { target: overlay.querySelector('pre') });
    overlay.dispatch('keydown', { key: 'Escape' }); assert.equal(view.openDialog, true);
    overlay.dispatch('compositionend', { target: overlay.querySelector('pre') }); overlay.dispatch('keydown', { key: 'Escape' }); await first;
    assert.equal(f.downloads.blobs.length, 0); assert.equal(doc.activeElement, view.resultMarkdownButton); assert.equal(f.host.inert, false);
    const second = view.exportResultsMarkdown(), next = doc.querySelector('.prompt-dialog-overlay'), accept = next.querySelector('.prompt-primary');
    oldCancel(); assert.equal(next.isConnected, true); assert.equal(view.openDialog, true);
    assert.equal(next.dispatch('keydown', { key: 'Enter', repeat: true }).prevented, true); assert.equal(f.downloads.blobs.length, 0);
    accept.dispatch('click'); accept.dispatch('click'); await second; oldCancel();
    assert.equal(f.downloads.clicks.length, 1); assert.equal(view.openDialog, false); assert.equal(doc.activeElement, view.resultMarkdownButton);
    assert.equal(history.open, true); assert.equal(history.querySelector('pre'), historyBody); assert.equal(historyBody.scrollTop, 37); assert.equal(c.selected, selected);
    detail.forEach((node, i) => assert.equal(view.main.children[i], node)); noIO(f); c.dispose();
});

for (const gate of ['busy', 'pending', 'error', 'pending read', 'unverified read', 'hidden document', 'hidden host', 'CSS hidden', 'inert', 'detached', 'foreign modal', 'revision', 'replaced owner', 'destroyed']) {
    test(`cannot begin while ${gate}`, async () => {
        const f = await mount({ count: 1 }), { c, view, doc, host } = f;
        const r = review(f); f.reset();
        if (gate === 'busy') c.busy = true;
        if (gate === 'pending') c.pendingCommand = {};
        if (gate === 'error') c.error = { code: 'READ', scope: 'read' };
        if (gate === 'pending read') c.pendingReadGeneration = c.readGeneration;
        if (gate === 'unverified read') c.comparisonReadGeneration--;
        if (gate === 'hidden document') doc.visibilityState = 'hidden';
        if (gate === 'hidden host') host.hidden = true;
        if (gate === 'CSS hidden') host.style.visibility = 'collapse';
        if (gate === 'inert') host.inert = true;
        if (gate === 'detached') host.remove();
        if (gate === 'foreign modal') { const modal = doc.createElement('dialog'); modal.open = true; doc.body.append(modal); }
        if (gate === 'revision') view.revisionContext = { current: () => true };
        if (gate === 'replaced owner') c.onChange = () => {};
        if (gate === 'destroyed') view.destroy();
        await view.exportResultsMarkdown(); assert.equal(r.seen.length, 0); assert.equal(f.downloads.blobs.length, 0); noIO(f); c.dispose();
    });
}

for (const change of ['filter round trip', 'sort', 'state', 'read generation', 'busy', 'pending', 'error', 'hidden round trip', 'detached', 'replaced owner', 'render', 'pagehide', 'bfcache']) {
    test(`late approval is refused after ${change} without stale status or resource leaks`, async () => {
        const f = await mount({ count: 1 }), { c, view, doc } = f, r = review(f); f.reset();
        const pending = view.exportResultsMarkdown(); assert.equal(r.seen.length, 1);
        if (change === 'filter round trip') { c.filter({ tag: 'other' }); c.filter({ tag: '' }); }
        if (change === 'sort') view.listSort = 'saved';
        if (change === 'state') c.state = clone(c.state);
        if (change === 'read generation') c.readGeneration++;
        if (change === 'busy') c.busy = true;
        if (change === 'pending') c.pendingCommand = {};
        if (change === 'error') c.error = { code: 'READ', scope: 'read' };
        if (change === 'hidden round trip') { doc.visibilityState = 'hidden'; await doc.listeners.get('visibilitychange')({}); doc.visibilityState = 'visible'; }
        if (change === 'detached') f.host.remove();
        if (change === 'replaced owner') c.onChange = () => {};
        if (change === 'render') view.render();
        if (change === 'pagehide' || change === 'bfcache') f.events.get('pagehide')({ persisted: change === 'bfcache' });
        view.status.textContent = 'Keep newer status'; r.resolve(true); await pending;
        assert.equal(f.downloads.blobs.length, 0); assert.equal(f.downloads.clicks.length, 0); assert.equal(view.status.textContent, 'Keep newer status');
        assert.equal(view.exportingMarkdown, false); assert.equal(view.resultMarkdownContext, null); noIO(f); c.dispose();
    });
}

test('refresh invalidates the real modal before the read settles; failed reads and clear-error selection cannot reuse old output', async () => {
    const f = await mount(), { c, view, doc } = f;
    const pending = view.exportResultsMarkdown(), overlay = doc.querySelector('.prompt-dialog-overlay'), oldAccept = overlay.querySelector('.prompt-primary');
    let reject; f.store.read = () => new Promise((resolve, no) => { reject = no; }); f.reset();
    const refreshing = c.refresh(); assert.equal(overlay.isConnected, false); assert.equal(view.openDialog, false); assert.equal(view.resultMarkdownButton.disabled, true);
    oldAccept.dispatch('click'); reject(Error('synthetic read failed')); await refreshing; await pending;
    c.select(f.records[0].id); assert.equal(c.error, null); assert.equal(view.resultMarkdownButton.disabled, true);
    await view.exportResultsMarkdown(); assert.equal(f.downloads.blobs.length, 0); noIO(f); c.dispose();
});

for (const failure of ['serialize', 'dialog', 'Blob', 'URL', 'click', 'revoke']) test(`${failure} failure cleans resources and never retries or truncates`, async () => {
    const f = await mount({ count: 1 }), { view, root, downloads } = f; view.dialog = async () => true;
    const fail = () => { throw Error(`synthetic ${failure}`); };
    if (failure === 'serialize') root.LocalItabAIMarkdown = { serialize: fail };
    if (failure === 'dialog') view.dialog = fail;
    if (failure === 'Blob') root.Blob = class { constructor() { fail(); } };
    if (failure === 'URL') root.URL.createObjectURL = fail;
    if (failure === 'click') { const create = f.doc.createElement; f.doc.createElement = tag => { const node = create(tag); if (tag === 'a') node.click = fail; return node; }; }
    if (failure === 'revoke') root.URL.revokeObjectURL = url => { downloads.revoked.push(url); fail(); };
    f.reset(); await assert.doesNotReject(view.exportResultsMarkdown());
    assert.equal(view.exportingMarkdown, false); assert.equal(view.resultMarkdownContext, null); assert.equal(downloads.anchors.some(node => node.download && node.isConnected), false);
    if (failure === 'click' || failure === 'revoke') assert.deepEqual(downloads.revoked, ['blob:results-1']);
    assert.equal(downloads.clicks.length, failure === 'revoke' ? 1 : 0);
    assert.match(view.status.textContent, failure === 'revoke' ? /Download requested/ : /could not be requested/); noIO(f); f.c.dispose();
});

test('a state change during URL creation suppresses the click and revokes the acquired URL', async () => {
    const f = await mount(), { c, view, root, downloads } = f; view.dialog = async () => true;
    const create = root.URL.createObjectURL; root.URL.createObjectURL = blob => { const url = create(blob); c.filter({ query: 'newer' }); return url; };
    f.reset(); await view.exportResultsMarkdown(); assert.equal(downloads.clicks.length, 0); assert.deepEqual(downloads.revoked, ['blob:results-1']);
    assert.equal(downloads.anchors.some(node => node.download && node.isConnected), false); assert.doesNotMatch(view.status.textContent || '', /Download requested/); noIO(f); c.dispose();
});

test('actual 200-item capacity and a near-budget literal collection serialize completely without truncation', async () => {
    for (const options of [{ count: 200 }, { count: 31, body: '`'.repeat(32000) }]) {
        const f = await mount(options), { c, view } = f;
        const stateBytes = Buffer.byteLength(JSON.stringify(f.raw())); assert.ok(stateBytes < Core.LIMITS.bytes - 16384);
        if (options.body) assert.ok(stateBytes > 1.9 * 1024 * 1024, 'actual validated collection is close to its storage budget');
        f.choose('saved'); const r = review(f); f.reset(); const pending = view.exportResultsMarkdown();
        assert.equal((r.seen[0].markdownPreview.match(/^# Saved collection$/gm) || []).length, options.count);
        if (options.body) assert.ok(Buffer.byteLength(r.seen[0].markdownPreview) > Core.LIMITS.bytes, 'fence expansion is fully retained rather than applying the input size budget to output');
        r.resolve(true); await pending; const output = await getText(f); assert.equal(output, r.seen[0].markdownPreview);
        for (const record of c.results().map(item => item.record)) assert.ok(output.includes(f.root.LocalItabAIMarkdown.serialize('collection', record)));
        assert.ok(output.includes(`Saved ${options.count}`)); assert.equal(f.downloads.clicks.length, 1); noIO(f); c.dispose();
    }
});

for (const locale of ['en', 'zh_CN', 'fallback']) test(`${locale} provides clear list/review/privacy labels with a full literal output`, async () => {
    const f = await mount({ count: 1, locale }), r = review(f); f.reset();
    const pending = f.view.exportResultsMarkdown();
    assert.equal(f.view.resultMarkdownButton.textContent, locale === 'zh_CN' ? '将筛选结果导出为 Markdown 合集' : 'Export filtered results as Markdown');
    assert.equal(r.seen[0].title, locale === 'zh_CN' ? '审阅筛选结果 Markdown 合集' : 'Review filtered-results Markdown');
    assert.match(r.seen[0].body, locale === 'zh_CN' ? /私人信息，并未脱敏/ : /private information/);
    assert.ok(r.seen[0].markdownPreview.includes('needle Saved 1')); r.resolve(false); await pending; noIO(f); f.c.dispose();
});
