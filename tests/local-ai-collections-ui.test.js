const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store.js');
const { setup, add, tick, settle } = require('./helpers/collections-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');
const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
async function mount(confirm = async () => true, i18n, safeReader = false) {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true }), events = new Map();
    const host = doc.createElement('div'); doc.body.append(host);
    const root = { i18n, document: doc, LocalItabAICollections: Core, addEventListener: (key, fn) => events.set(key, fn), location: { assign() {} } };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise, Map });
    let readerParses = 0;
    if (safeReader) { const Marked = require('../vendor/marked/marked.umd.js'); root.marked = { Lexer: class extends Marked.Lexer { lex(source) { readerParses++; return super.lex(source); } } }; vm.runInContext(fs.readFileSync('shared/safe-answer-reader.js', 'utf8'), context); }
    vm.runInContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('shared/local-ai-collections-view.js', 'utf8'), context);
    const view = new root.LocalItabCollectionsView.View({ host, controller: h.controller, confirm }); view.attachDepartureGuard(); view.render(); await h.controller.start();
    return { ...h, h, host, doc, view, events, root, get readerParses() { return readerParses; } };
}
for (const omitSourceUrls of [false, true]) test(`downloaded collection JSON parses once and preserves exact content (omit URLs: ${omitSourceUrls})`, async () => {
    const h = await mount(), c = h.controller;
    const body = '  <script>"literal"</script>\r\n中文 🧪 {{topic}}\\path\t  ';
    const notes = '  My notes\r\n中文 🧪 <b>literal</b>  ';
    await add(c, 'Original', body);
    c.edit(); c.update('sourceUrl', 'https://example.com/private'); c.update('notes', notes); await c.save(); await settle(c);
    const plan = await c.reviewBody(`${body}\r\nRevision`); assert.equal(await c.acceptRevision(plan), true);
    const source = await h.store.export();
    await h.store.mutate(h.store.request('replace', await h.store.review(source)));
    await tick();
    const before = await h.store.read(), writes = h.h.writes;
    const expected = JSON.parse(await h.store.export({ omitSourceUrls }));
    // The model view and real store occupy separate VM realms; browser code does not.
    const exportCopy = h.store.export.bind(h.store);
    h.store.export = options => exportCopy(JSON.parse(JSON.stringify(options)));
    const blobs = [], clicks = [], revoked = [], timers = [];
    h.root.Blob = Blob;
    h.root.URL = { createObjectURL(blob) { blobs.push(blob); return 'blob:collection-export'; }, revokeObjectURL(url) { revoked.push(url); } };
    h.root.setTimeout = fn => { timers.push(fn); };
    const createElement = h.doc.createElement;
    h.doc.createElement = tag => {
        const node = createElement(tag);
        if (tag === 'a') node.click = () => clicks.push({ href: node.href, filename: node.download, connected: node.isConnected });
        return node;
    };
    const downloading = h.view.exportFile();
    const dialog = h.doc.body.querySelector('.prompt-dialog-overlay');
    const checkbox = dialog.querySelector('input'); checkbox.checked = omitSourceUrls; checkbox.dispatch('change');
    dialog.querySelector('.prompt-primary').dispatch('click');
    await downloading;
    assert.equal(blobs.length, 1);
    assert.equal(blobs[0].type, 'application/json');
    const bytes = Buffer.from(await blobs[0].arrayBuffer());
    const downloaded = JSON.parse(bytes.toString('utf8'));
    assert.equal(typeof downloaded, 'object', 'one JSON parse yields the backup object, not a quoted JSON string');
    assert.deepEqual(downloaded, expected);
    assert.deepEqual(Core.parseBackup(bytes.toString('utf8')), expected);
    for (const group of [downloaded.content, ...downloaded.recovery.map(item => item.content)]) {
        assert.equal(group.records[0].body, `${body}\r\nRevision`);
        assert.equal(group.records[0].history[0].body, body);
        assert.equal(group.records[0].notes, notes);
        assert.equal(group.records[0].sourceUrl, omitSourceUrls ? '' : 'https://example.com/private');
    }
    assert.equal(downloaded.recovery.length, 1);
    assert.deepEqual(await h.store.read(), before, 'URL omission affects only the downloaded copy');
    assert.equal(h.h.writes, writes);
    assert.deepEqual(clicks, [{ href: 'blob:collection-export', filename: 'local-itab-ai-collection.json', connected: true }]);
    assert.equal(h.doc.body.querySelectorAll('a').some(node => node.href === 'blob:collection-export'), false);
    timers.forEach(fn => fn()); assert.deepEqual(revoked, ['blob:collection-export']);
    c.dispose();
});
test('capture keeps exact text and separates annotations; drafts never write before save', async () => {
    const h = setup(), c = h.controller; await c.start(); c.create(); c.update('title', 'Useful'); c.update('body', '  <script>\r\nexact\t'); c.update('notes', 'My interpretation'); assert.equal(h.writes, 0); await c.save();
    assert.equal(c.record().body, '  <script>\r\nexact\t'); assert.equal(c.record().notes, 'My interpretation'); assert.equal(c.record().history.length, 1); c.dispose();
});
test('metadata saves cannot revise body; explicit preview and acceptance append history', async () => {
    const h = setup(), c = h.controller; await c.start(); await add(c); c.edit(); c.update('body', 'new text'); assert.equal(await c.save(), false); assert.equal(c.error.code, 'REVIEW_REQUIRED'); c.discard();
    await settle(c); const plan = await c.reviewBody('new text'); assert.notEqual(c.record().body, 'new text'); assert.equal(await c.acceptRevision(plan), true); assert.equal(c.record().body, 'new text'); assert.equal(c.record().history.length, 2); c.dispose();
});
test('archiving and restore retain body history and unresolved references', async () => {
    const h = setup(), c = h.controller; await c.start(); await add(c); c.edit(); c.update('promptId', 'prompt_0001'); c.update('bodyVersionId', 'version_0001'); await c.save(); const ref = c.record().promptRef;
    await c.action('remove'); assert.equal(c.results().length, 0); c.filter({ mode: 'trash' }); assert.equal(c.results().length, 1); await c.action('restore'); assert.deepEqual(c.record().promptRef, ref); assert.equal(Core.resolvePromptReference(c.record()).status, 'unresolved'); c.dispose();
});
test('type, tool and tag filters intersect local body search', async () => {
    const h = setup(), c = h.controller; await c.start(); await add(c, 'Snippet', '中文 exact code'); c.edit(); c.update('type', 'code'); c.update('tool', 'Example'); c.update('tagsText', 'research, 中文'); await c.save(); c.filter({ query: '中文', type: 'code', tool: 'Example', tag: 'research' }); assert.equal(c.results().length, 1); c.filter({ tool: 'Other' }); assert.equal(c.results().length, 0); c.dispose();
});
test('uncertain committed add retries exact operation without duplicate and preserves draft', async () => {
    const h = setup(), c = h.controller; await c.start(); c.create(); c.update('title', 'Title'); c.update('body', 'Exact'); h.failOnce(); assert.equal(await c.save(), false); assert.ok(c.pendingCommand); assert.ok(c.draft()); const command = c.pendingCommand.command; await c.refresh(); await c.retry(); assert.equal(c.state.records.length, 1); assert.equal(c.record().id, command.operationId); assert.equal(c.draft(), undefined); c.dispose();
});
test('stale metadata draft is retained and can only become a new independent item', async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await add(c); c.edit(); c.update('notes', 'draft'); await h.store.mutate(h.store.request('edit', { id: record.id, version: record.version, notes: 'remote' })); await tick(); assert.equal(c.draft().conflict, true); assert.equal(await c.save(), false); assert.equal(await c.save(true), true); assert.equal(c.state.records.length, 2); assert.equal(c.record().notes, 'draft'); c.dispose();
});
test('view renders loading/empty/editor and input updates preserve textarea focus', async () => {
    const h = await mount(), c = h.controller; assert.match(text(h.host), /Keep the useful part/); h.view.newButton.dispatch('click'); const field = h.view.editor.fields.body; field.focus(); field.value = '<img onerror=x>\n  exact'; field.dispatch('input'); assert.equal(h.doc.activeElement, field); assert.equal(h.view.editor.fields.body, field); c.update('title', 'Title'); await h.view.save(); assert.match(text(h.host), /<img onerror=x>/); assert.equal(h.host.querySelectorAll('script, iframe').length, 0); const images = h.host.querySelectorAll('img'); assert.equal(images.length, 1); assert.equal(images[0].className, 'prompt-brand-mark'); assert.equal(images[0].src, 'assets/icon48.png'); assert.equal(images[0].alt, ''); c.dispose();
});
test('edit body is readonly; duplicate cancel does not save or merge', async () => {
    let approved = false; const h = await mount(async () => approved), c = h.controller; const record = await add(c, 'First', 'same'); c.edit(); assert.equal(h.view.editor.fields.body.readOnly, true); c.discard(); c.create(); c.update('title', 'Second'); c.update('body', 'same'); await h.view.save(); assert.equal(c.state.records.length, 1); assert.ok(c.draft()); approved = true; await h.view.save(); assert.equal(c.state.records.length, 2); assert.equal(c.state.records[0].id, record.id); c.dispose();
});
test('source link shows actual host and never creates previews; unavailable prompt reads keep IDs', async () => {
    const h = await mount(), c = h.controller; await add(c); c.edit(); c.update('sourceUrl', 'https://example.com:8443/private?q=1'); c.update('promptId', 'prompt_0001'); c.update('bodyVersionId', 'version_0001'); await c.save();
    const link = h.host.querySelector('.collection-source'); assert.match(link.textContent, /example.com:8443/); assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer'); assert.equal(link.referrerPolicy, 'no-referrer'); assert.match(text(h.host), /Local prompts could not be read/); c.dispose();
});
test('revision cancel and failure retain proposed text in tab and guard departure', async () => {
    const h = await mount(), c = h.controller; const record = await add(c); let calls = 0;
    h.view.dialog = async options => { calls++; if (options.onInput) { options.onInput('proposed exact'); return true; } return false; };
    await h.view.revise(record); assert.equal(c.record().body, record.body); assert.equal(h.view.proposals.get(record.id), 'proposed exact'); assert.match(text(h.host), /proposed excerpt is kept/);
    const e = { preventDefault() { this.prevented = true; } }; h.events.get('beforeunload')(e); assert.equal(e.prevented, true); assert.equal(calls, 2); c.dispose();
});
test('modal cancel restores focus and preserves IME escape', async () => {
    const h = await mount(); h.view.newButton.focus(); const promise = h.view.dialog({ title: 'Review', body: 'Text', accept: 'Accept' }); const overlay = h.doc.body.querySelector('.prompt-dialog-overlay'), button = overlay.querySelector('button'); button.dispatch('keydown', { key: 'Escape', isComposing: true }); assert.equal(h.view.openDialog, true); button.dispatch('keydown', { key: 'Escape' }); assert.equal(await promise, false); assert.equal(h.doc.activeElement, h.view.newButton); h.controller.dispose();
});
test('bootstrap requires fenced backend; no fetch, HTML parsing, providers, remote scripts or write fallback', () => {
    const src = fs.readFileSync('collections.js', 'utf8') + fs.readFileSync('shared/local-ai-collections-view.js', 'utf8'); assert.match(src, /createCollectionBackend/); assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|fetch\(|XMLHttpRequest|readText\(|chrome\.permissions|eval\(|storage\.local\.set/); assert.doesNotMatch(fs.readFileSync('collections.html', 'utf8'), /https?:\/\//);
});
test('revision begun before a cross-tab change refuses stale comparison and preserves proposal', async () => {
    const h = await mount(), c = h.controller; const record = await add(c); h.view.dialog = async options => { options.onInput('proposed'); await h.store.mutate(h.store.request('edit', { id: record.id, version: record.version, notes: 'other tab' })); await tick(); return true; };
    await h.view.revise(record); assert.equal(c.error, null, 'the superseded review cannot publish stale feedback'); assert.equal(c.record().body, record.body); assert.equal(h.view.proposals.get(record.id), 'proposed'); c.dispose();
});
test('a kept revision can be resumed and explicitly accepted without dropping original history', async () => {
    const h = await mount(), c = h.controller; const record = await add(c); h.view.proposals.set(record.id, 'kept text'); h.view.dialog = async () => true; await h.view.revise(record); assert.equal(c.record().body, 'kept text'); assert.equal(c.record().history[0].body, record.body); assert.equal(h.view.proposals.size, 0); c.dispose();
});
test('saving annotations leaves exact body history unchanged', async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await add(c); c.edit(); c.update('notes', 'different notes'); c.update('tagsText', 'local'); await c.save(); assert.deepEqual(c.record().history, record.history); assert.equal(c.record().currentVersionId, record.currentVersionId); c.dispose();
});
test('new draft from a proposed revision cannot overwrite an existing new draft', async () => {
    const h = await mount(), c = h.controller; const record = await add(c); h.view.proposals.set(record.id, 'proposal'); c.create(); c.update('body', 'existing draft'); c.select(record.id); h.view.proposalAsNew(record); assert.equal(c.draft().input.body, 'existing draft'); c.discard(); h.view.proposalAsNew(record); assert.equal(c.draft().input.body, 'proposal'); assert.equal(c.draft().id, undefined); await c.save(); assert.equal(c.state.records.length, 2); c.dispose();
});
test('English and Chinese catalogs include all static collection labels', () => {
    const source = fs.readFileSync('shared/local-ai-collections-view.js', 'utf8'); const keys = [...source.matchAll(/(?:this\.t|this\.button|this\.paragraph)\('([^']+)', '/g)].map(match => `collections${match[1]}`);
    for (const locale of ['en', 'zh_CN']) { const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8')); for (const key of keys) assert.ok(messages[key]?.message, `${locale}: ${key}`); }
});

for (const locale of ['en', 'zh_CN']) test(`collection heading and title field stay distinct in Chrome's case-insensitive catalog (${locale})`, async () => {
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const normalized = new Map();
    for (const [key, value] of Object.entries(messages)) {
        assert.equal(normalized.has(key.toLowerCase()), false, `Case-insensitive duplicate: ${key}`);
        normalized.set(key.toLowerCase(), value.message);
    }
    const h = await mount(undefined, { t: key => normalized.get(key.toLowerCase()) || key });
    assert.equal(h.host.querySelector('h1').textContent, locale === 'en' ? 'AI result collection' : 'AI 结果收藏');
    h.controller.create();
    assert.equal(h.view.editor.fields.title.parentElement.querySelector('span').textContent, locale === 'en' ? 'Title' : '标题');
    h.controller.dispose();
});
test('collection page supplies theme tokens before appearance storage loads', () => {
    const html = fs.readFileSync('collections.html', 'utf8');
    const root = html.match(/<html\b[^>]*>/)[0];
    assert.match(root, /data-dashboard-template="clarity"/);
    assert.match(root, /data-color-mode="light"/);
    assert.ok(html.indexOf('href="appearance.css"') < html.indexOf('href="prompts.css"'));
    const appearance = fs.readFileSync('appearance.css', 'utf8');
    for (const mode of ['light', 'dark']) {
        assert.ok(appearance.includes(`:root[data-dashboard-template][data-color-mode="${mode}"]`));
    }
    const css = fs.readFileSync('prompts.css', 'utf8');
    assert.match(css, /border: 1px solid var\(--template-border\)/);
    assert.match(css, /outline: 3px solid var\(--template-focus\)/);
});

for (const outcome of ['resolve', 'reject']) {
    for (const change of ['selection', 'selection round trip', 'saved version', 'disposed', 'unchanged']) {
        test(`pending excerpt copy ${outcome} handles ${change} without stale feedback`, async () => {
            const h = await mount(), c = h.controller;
            const a = await add(c, 'Collection A', 'Text A'), b = await add(c, 'Collection B', 'Text B');
            c.select(a.id);
            let resolve, reject;
            const promise = new Promise((yes, no) => { resolve = yes; reject = no; }), writes = [];
            h.view.clipboard = { writeText(body) { writes.push(body); return promise; } };
            const pending = h.view.copy(a.body); await h.view.copy(a.body);
            assert.deepEqual(writes, ['Text A'], 'double-click cannot start another write');
            if (change === 'selection') c.select(b.id);
            if (change === 'selection round trip') { c.select(b.id); c.select(a.id); }
            if (change === 'saved version') {
                c.edit(); c.update('title', 'Updated title'); assert.equal(await c.save(), true); await settle(c);
                assert.notEqual(c.record().version, a.version); assert.equal(c.record().body, a.body);
            }
            if (change === 'disposed') c.dispose();
            const status = h.view.status.textContent;
            h.view.search.focus(); const focus = h.doc.activeElement;
            if (outcome === 'resolve') resolve(); else reject(new Error('blocked'));
            await pending;
            assert.deepEqual(writes, ['Text A'], 'no automatic recopy');
            assert.equal(h.view.copying, false, 'clipboard lock always releases');
            assert.equal(h.doc.activeElement, focus);
            if (change === 'unchanged') assert.match(h.view.status.textContent, outcome === 'resolve' ? /Excerpt copied/ : /Copy was blocked/);
            else assert.equal(h.view.status.textContent, status, 'current detail retains its own feedback');
            h.view.clipboard = { async writeText(body) { writes.push(body); } };
            await h.view.copy(c.record().body);
            if (change === 'disposed') assert.deepEqual(writes, ['Text A']);
            else { assert.deepEqual(writes, ['Text A', c.record().body]); assert.match(h.view.status.textContent, /Excerpt copied/); }
            c.dispose();
        });
    }
}

test('saved context detail shows literal historical input and original answer version after revision', async () => {
    const h = await mount();
    const packed = require('../shared/ai-context').pack('<script>Question</script>', [{ id: 'source', label: '<img src=x>', text: 'Synthetic reviewed text' }]);
    const contextSnapshot = { schemaVersion: 1, question: packed.question, sources: packed.sources, prompt: packed.prompt, endpoint: 'https://model.example/v1/chat/completions', model: 'mock' };
    let saved = await h.store.mutate(h.store.request('add', { title: 'Snapshot', body: 'First answer', contextSnapshot }));
    const first = saved.records[0], plan = await h.store.reviewRevision({ id: first.id, version: first.version, body: 'Edited answer' });
    saved = await h.store.mutate(h.store.request('revise', plan)); await h.controller.refresh(); h.controller.select(first.id); h.view.render();
    const panel = h.host.querySelector('.collection-context-snapshot'); assert.equal(Boolean(panel), true);
    assert.equal(panel.querySelector('pre').textContent, JSON.stringify(contextSnapshot, null, 2));
    assert.match(text(panel), new RegExp(first.currentVersionId)); assert.match(text(panel), /Imported snapshots are user-provided/);
    assert.equal(h.host.querySelectorAll('script').length, 0); const images = h.host.querySelectorAll('img'); assert.equal(images.length, 1);
    assert.equal(images[0].className, 'prompt-brand-mark'); assert.equal(images[0].src, 'assets/icon48.png'); assert.equal(images[0].alt, '');
});

test('saved annotation search and clear filters preserve selected editor, unsaved drafts and archive scope with zero writes', async () => {
    const h = await mount(), c = h.controller;
    const saved = await add(c, 'Alpha', 'Current body'); c.edit(); c.update('notes', 'SavedNeedle <img src=x> 中文');
    c.update('type', 'code'); c.update('tool', 'Example'); c.update('tagsText', 'research'); await c.save();
    c.edit(); c.update('notes', 'DraftOnly');
    const editor = h.view.editor, mainChild = h.view.main.children[0], draft = c.draft(), writes = h.h.writes, before = h.h.raw;
    c.filter({ query: 'savedneedle alpha', type: 'code', tool: 'Example', tag: 'research' });
    assert.equal(c.results().length, 1); assert.match(text(h.view.list), /Matched saved annotations/);
    assert.match(text(h.view.list), /SavedNeedle <img src=x> 中文/); assert.equal(h.view.list.querySelectorAll('img').length, 0);
    c.filter({ query: 'DraftOnly' }); assert.equal(c.results().length, 0);
    c.filter({ query: 'savedneedle', tool: 'Other' }); assert.equal(c.results().length, 0);
    c.filter({ tool: 'Example', tag: 'Other' }); assert.equal(c.results().length, 0);
    c.filter({ tag: 'research', type: 'plan' }); assert.equal(c.results().length, 0);
    c.filter({ type: 'code', mode: 'trash' }); assert.equal(c.results().length, 0);
    h.view.clearFilters.dispatch('click');
    assert.deepEqual(c.filters, { query: '', type: '', tool: '', tag: '', mode: 'trash' });
    assert.equal(c.results().length, 0); assert.equal(h.view.clearFilters.disabled, true);
    assert.equal(c.selected, saved.id); assert.equal(c.draft(), draft); assert.equal(draft.input.notes, 'DraftOnly');
    assert.equal(h.view.editor, editor); assert.equal(h.view.main.children[0], mainChild);
    c.filter({ mode: 'all' }); assert.equal(c.results().length, 1);
    assert.equal(h.h.writes, writes); assert.deepEqual(h.h.raw, before);
    c.dispose();
});

test('annotation query keeps archived records isolated and localized source labels', async () => {
    const locale = JSON.parse(fs.readFileSync('_locales/zh_CN/messages.json', 'utf8'));
    const h = await mount(undefined, { t: key => locale[key]?.message || key }), c = h.controller;
    await add(c); c.edit(); c.update('notes', '归档批注'); await c.save(); await c.action('remove');
    const writes = h.h.writes; c.filter({ query: '归档批注' }); assert.equal(c.results().length, 0);
    c.filter({ mode: 'trash' }); assert.equal(c.results().length, 1); assert.match(text(h.view.list), /匹配已保存批注/);
    assert.equal(h.view.clearFilters.textContent, '清除筛选'); h.view.clearFilters.dispatch('click');
    assert.equal(c.filters.mode, 'trash'); assert.equal(c.results().length, 1); assert.equal(h.h.writes, writes); c.dispose();
});

for (const language of ['en', 'zh_CN']) test(`uncertain collection save exposes read-only verification and blocks new copies (${language})`, async () => {
    const messages = JSON.parse(fs.readFileSync(`_locales/${language}/messages.json`, 'utf8'));
    const h = await mount(undefined, { t: key => messages[key]?.message || key }), c = h.controller;
    const original = await add(c, 'Original', 'Exact original'); c.edit(); c.update('notes', 'Submitted notes'); h.h.failOnce();
    assert.equal(await c.save(true), false); await tick(); const operation = c.pendingCommand;
    await h.store.mutate(h.store.request('edit', { id: original.id, version: original.version, title: 'Other tab' })); await tick();
    assert.equal(await c.retry(), false); await tick(); const writes = h.h.writes, before = JSON.stringify(h.h.raw);
    assert.equal(c.pendingInspection, true);
    const inspect = h.view.status.querySelectorAll('button').find(button => button.textContent === messages.collectionsInspectSave.message);
    assert.ok(inspect); assert.equal(inspect.disabled, false);
    assert.equal(h.view.status.querySelectorAll('button').some(button => button.textContent === messages.collectionsRetry.message), false);
    assert.equal(h.view.main.querySelectorAll('button, input, textarea, select').every(control => control.disabled), true);
    assert.match(text(h.view.status), language === 'en' ? /earlier save may already have completed/ : /先前操作可能已保存成功/);
    const event = { preventDefault() { this.prevented = true; } }; h.events.get('beforeunload')(event); assert.equal(event.prevented, true);
    inspect.dispatch('click'); await settle(c);
    assert.equal(c.pendingCommand, null); assert.equal(c.record().id, operation.command.operationId);
    assert.equal(h.view.status.textContent, messages.collectionsOutcomeVerified.message);
    assert.equal(h.h.writes, writes); assert.equal(JSON.stringify(h.h.raw), before); c.dispose();
});

async function historicalPromptFixture({ safeReader = false, body = 'Original answer' } = {}) {
    const h = await mount(undefined, undefined, safeReader), c = h.controller;
    const packed = require('../shared/ai-context').pack('  Synthetic "question" 中文 español 🧪 <script>x</script>\n\\path', [{ id: 'source', label: 'Synthetic', text: 'Exact\nreviewed\ttext' }]);
    const contextSnapshot = { schemaVersion: 1, question: packed.question, sources: packed.sources, prompt: packed.prompt, endpoint: 'https://model.example/v1/chat/completions', model: 'outer-metadata-only' };
    const saved = await h.store.mutate(h.store.request('add', { title: 'Snapshot', body, contextSnapshot }));
    await c.refresh(); c.select(saved.records[0].id);
    const section = h.host.querySelector('.collection-context-snapshot');
    const open = section.querySelectorAll('button').find(b => b.textContent === 'Review historical full prompt');
    const panel = section.querySelector('.collection-historical-prompt'), prompt = panel.querySelector('pre');
    const copy = panel.querySelectorAll('button').find(b => b.textContent === 'Copy historical prompt');
    const close = panel.querySelectorAll('button').find(b => b.textContent === 'Close prompt review');
    return { ...h, c, contextSnapshot, open, panel, prompt, copy, close, feedback: panel.querySelector('[role="status"]') };
}
test('historical prompt explicit review/copy is exact, literal, read-only and separate from answer copy', async () => {
    const h = await historicalPromptFixture(), writes = [], before = h.h.writes;
    h.root.fetch = () => { throw Error('No network'); };
    h.root.chrome = { permissions: { request() { throw Error('No permissions'); } } };
    h.view.clipboard = { async writeText(value) { writes.push(value); } };
    assert.equal(h.panel.hidden, true); h.copy.dispatch('click'); await tick(); assert.deepEqual(writes, []);
    h.open.dispatch('click'); assert.equal(h.panel.hidden, false); assert.equal(h.doc.activeElement, h.prompt);
    assert.equal(h.open.getAttribute('aria-expanded'), 'true'); assert.equal(h.prompt.tabIndex, 0);
    assert.equal(h.prompt.textContent, h.contextSnapshot.prompt); assert.equal(h.panel.querySelectorAll('script').length, 0);
    assert.match(text(h.panel), new RegExp(h.c.record().history[0].id));
    h.copy.dispatch('click'); await tick(); assert.deepEqual(writes, [h.contextSnapshot.prompt]);
    assert.match(h.feedback.textContent, /Historical prompt copied/);
    await h.view.copy(h.c.record().body); assert.deepEqual(writes, [h.contextSnapshot.prompt, 'Original answer']);
    assert.equal(h.h.writes, before); h.close.dispatch('click'); assert.equal(h.doc.activeElement, h.open);
    assert.equal(h.panel.hidden, true); assert.equal(h.open.getAttribute('aria-expanded'), 'false'); h.c.dispose();
});
for (const outcome of ['resolve', 'reject']) for (const change of ['unchanged', 'switch', 'edit', 'archive', 'reload', 'destroy', 'pagehide', 'bfcache', 'close-reopen', 'uncertain']) {
    test(`historical prompt pending ${outcome} with ${change} never retries or gives stale feedback`, async () => {
        const h = await historicalPromptFixture(), writes = []; let resolve, reject;
        const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
        h.view.clipboard = { writeText(value) { writes.push(value); return pending; } };
        h.open.dispatch('click'); h.copy.dispatch('click'); h.copy.dispatch('click');
        assert.deepEqual(writes, [h.contextSnapshot.prompt]);
        if (change === 'switch') await add(h.c, 'Other', 'other');
        if (change === 'edit') h.c.edit();
        if (change === 'archive') await h.c.action('remove');
        if (change === 'reload') await h.c.refresh();
        if (change === 'destroy') h.view.destroy();
        if (change === 'pagehide') h.events.get('pagehide')({ persisted: false });
        if (change === 'bfcache') h.events.get('pagehide')({ persisted: true });
        if (change === 'close-reopen') { h.close.dispatch('click'); h.open.dispatch('click'); }
        if (change === 'uncertain') { h.c.edit(); h.c.update('notes', 'Synthetic note'); h.h.failOnce(); await h.c.save(); assert.ok(h.c.pendingCommand); }
        const status = h.feedback.textContent, pageStatus = h.view.status.textContent;
        h.view.search.focus();
        if (outcome === 'resolve') resolve(); else reject(Error('clipboard unknown'));
        await tick();
        assert.equal(h.view.copying, false); assert.equal(h.doc.activeElement, h.view.search);
        assert.deepEqual(writes, [h.contextSnapshot.prompt]); assert.equal(h.view.status.textContent, pageStatus);
        if (change === 'unchanged') assert.match(h.feedback.textContent, outcome === 'resolve' ? /Historical prompt copied/ : /Select the historical prompt text/);
        else assert.equal(h.feedback.textContent, status);
        h.c.dispose();
    });
}
test('missing clipboard retains manually selectable prompt and does not auto retry', async () => {
    const h = await historicalPromptFixture(); h.view.clipboard = undefined;
    h.open.dispatch('click'); h.copy.dispatch('click'); await tick();
    assert.match(h.feedback.textContent, /No automatic retry/); assert.equal(h.prompt.textContent, h.contextSnapshot.prompt);
    assert.equal(h.doc.activeElement, h.prompt); h.c.dispose();
});
test('archived and revised answers retain first-version historical prompt; ordinary excerpts have no review', async () => {
    const h = await historicalPromptFixture(), first = h.c.record().history[0].id;
    const plan = await h.c.reviewBody('Revised answer'); await h.c.acceptRevision(plan);
    await h.c.action('remove'); h.c.filter({ mode: 'trash' });
    const panel = h.host.querySelector('.collection-historical-prompt');
    assert.equal(panel.querySelector('pre').textContent, h.contextSnapshot.prompt); assert.match(text(panel), new RegExp(first));
    await add(h.c, 'No snapshot', 'body'); assert.equal(h.host.querySelector('.collection-historical-prompt'), null); h.c.dispose();
});

test('BFCache restore requires fresh review, restores a usable entry, and suppresses old clipboard completion', async () => {
    const h = await historicalPromptFixture(), writes = []; let finish;
    h.view.clipboard = { writeText(value) { writes.push(value); return new Promise(resolve => { finish = resolve; }); } };
    h.open.dispatch('click'); h.copy.dispatch('click');
    h.events.get('pagehide')({ persisted: true }); h.events.get('pageshow')({ persisted: true });
    const panel = h.host.querySelector('.collection-historical-prompt'); assert.equal(panel.hidden, true);
    h.open.dispatch('click'); assert.equal(h.panel.hidden, true, 'old controls remain inert');
    const open = h.host.querySelectorAll('button').find(b => b.textContent === 'Review historical full prompt');
    open.dispatch('click'); assert.equal(panel.hidden, false);
    const copy = panel.querySelectorAll('button').find(b => b.textContent === 'Copy historical prompt');
    copy.dispatch('click'); assert.equal(writes.length, 1, 'in-flight clipboard remains serialized across restore');
    finish(); await tick(); assert.equal(panel.querySelector('[role="status"]').textContent, '');
    h.view.clipboard = { async writeText(value) { writes.push(value); } }; copy.dispatch('click'); await tick();
    assert.deepEqual(writes, [h.contextSnapshot.prompt, h.contextSnapshot.prompt]);
    assert.match(panel.querySelector('[role="status"]').textContent, /Historical prompt copied/); h.c.dispose();
});

test('saved current body reader caches unchanged text, keeps copy/export exact, resets on selection/edit/departure', async () => {
    const h = await mount(undefined, undefined, true), c = h.controller;
    const source = '# Synthetic\r\n\n**exact** 中文 🧪\t  ', a = await add(c, 'First', source);
    assert.equal(h.readerParses, 1); const reader = h.host.querySelector('.answer-reader');
    const [reading, original] = reader.querySelectorAll('button'); original.dispatch('click');
    h.view.render(); assert.equal(h.readerParses, 1); assert.equal(h.host.querySelector('.answer-reader'), reader);
    assert.equal(original.getAttribute('aria-pressed'), 'true');
    c.busy = true; h.view.render(); assert.equal(reading.disabled, true); c.busy = false; h.view.render(); assert.equal(reading.disabled, false);
    const copied = []; h.view.clipboard = { writeText: async value => copied.push(value) };
    h.host.querySelectorAll('button').find(node => node.textContent === 'Copy excerpt').dispatch('click'); await tick(); assert.deepEqual(copied, [source]);
    const exported = JSON.parse(await h.store.export()); assert.equal(exported.content.records[0].body, source);
    assert.equal(c.record().history[0].body, source);
    c.edit(); assert.equal(h.host.querySelector('.answer-reader'), null); assert.equal(reader.children.length, 0);
    c.discard(); assert.equal(h.readerParses, 2);
    const b = await add(c, 'Second', '# Second body'); assert.equal(h.readerParses, 3);
    c.select(a.id); assert.equal(h.readerParses, 4); assert.equal(h.host.querySelector('.answer-reader-source').textContent, source);
    const departed = h.host.querySelector('.answer-reader'); h.events.get('pagehide')({ persisted: true }); assert.equal(departed.children.length, 0);
    h.events.get('pageshow')({ persisted: true }); assert.equal(h.readerParses, 5);
    h.view.destroy(); assert.equal(h.host.querySelector('.answer-reader'), null); c.dispose();
});


const collectionCodeSource = '# Synthetic saved answer\r\n\r\n```js\r\n  const value = "<img onerror=synthetic> 中文 🧪";\r\n\tvalue;  \r\n```\r\n\r\n~~~text\r\nsecond block <script>literal</script>\r\n~~~';
test('saved code blocks, complete excerpt and historical prompt share a pending clipboard lock', async () => {
    const h = await historicalPromptFixture({ safeReader: true, body: collectionCodeSource }), writes = []; let finish;
    h.view.clipboard = { writeText(value) { writes.push(value); return new Promise(resolve => { finish = resolve; }); } };
    h.open.dispatch('click');
    const reader = h.host.querySelector('.answer-reader'), blocks = reader.querySelectorAll('.answer-reader-copy-code');
    const code = reader.querySelectorAll('pre code'), feedback = reader.querySelector('.answer-reader-copy-status');
    let whole = h.host.querySelectorAll('button').find(node => node.textContent === 'Copy excerpt');
    const before = h.h.writes, record = h.c.record();
    assert.equal(blocks.length, 2); assert.equal(feedback.getAttribute('role'), 'status');
    blocks[0].dispatch('click'); assert.deepEqual(writes, [code[0].textContent], 'clipboard starts before the click handler returns');
    assert(blocks.every(node => node.disabled)); assert.equal(whole.disabled, true); assert.equal(h.copy.disabled, true);
    blocks[1].dispatch('click'); whole.dispatch('click'); h.copy.dispatch('click'); assert.equal(writes.length, 1);
    h.view.render(); whole = h.host.querySelectorAll('button').find(node => node.textContent === 'Copy excerpt');
    assert.equal(h.host.querySelector('.answer-reader'), reader); assert(blocks.every(node => node.disabled)); assert.equal(whole.disabled, true);
    assert(reader.querySelectorAll('.answer-reader-controls button').every(node => !node.disabled), 'reader navigation stays usable during clipboard write');
    finish(); await tick(); assert.equal(feedback.textContent, '', 'rerender owns a fresh feedback lifecycle');
    assert(blocks.every(node => !node.disabled)); whole.dispatch('click'); assert.equal(writes[1], collectionCodeSource);
    blocks[1].dispatch('click'); assert.equal(writes.length, 2); finish(); await tick();
    const open = h.host.querySelectorAll('button').find(node => node.textContent === 'Review historical full prompt'); open.dispatch('click');
    const historical = h.host.querySelectorAll('button').find(node => node.textContent === 'Copy historical prompt'); historical.dispatch('click');
    assert.equal(writes[2], h.contextSnapshot.prompt); assert(blocks.every(node => node.disabled)); assert.equal(whole.disabled, true);
    blocks[0].dispatch('click'); whole.dispatch('click'); assert.equal(writes.length, 3); finish(); await tick();
    blocks[1].dispatch('click'); assert.equal(writes[3], code[1].textContent); finish(); await tick(); assert.match(feedback.textContent, /Code copied/);
    assert.equal(h.h.writes, before); assert.equal(h.c.record(), record); assert.equal(h.readerParses, 1); h.c.dispose();
});
for (const outcome of ['resolve', 'reject']) for (const change of ['raw', 'rerender', 'edit', 'switch', 'reload', 'archive', 'hidden', 'detach', 'bfcache', 'destroy']) {
    test(`saved code-copy ${outcome} suppresses stale feedback after ${change}`, async () => {
        const h = await historicalPromptFixture({ safeReader: true, body: collectionCodeSource }), writes = []; let resolve, reject;
        const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
        h.view.clipboard = { writeText(value) { writes.push(value); return pending; } };
        const reader = h.host.querySelector('.answer-reader'), block = reader.querySelector('.answer-reader-copy-code'), feedback = reader.querySelector('.answer-reader-copy-status');
        block.dispatch('click'); assert.equal(writes.length, 1);
        if (change === 'raw') { reader.querySelectorAll('.answer-reader-controls button')[1].dispatch('click'); reader.querySelectorAll('.answer-reader-controls button')[0].dispatch('click'); }
        if (change === 'rerender') h.view.render();
        if (change === 'edit') h.c.edit();
        if (change === 'switch') await add(h.c, 'Other code', '```text\nother code\n```');
        if (change === 'reload') await h.c.refresh();
        if (change === 'archive') await h.c.action('remove');
        if (change === 'hidden') { h.doc.visibilityState = 'hidden'; h.doc.listeners.get('visibilitychange')(); h.doc.visibilityState = 'visible'; h.doc.listeners.get('visibilitychange')(); }
        if (change === 'detach') reader.remove();
        if (change === 'bfcache') { h.events.get('pagehide')({ persisted: true }); h.events.get('pageshow')({ persisted: true }); }
        if (change === 'destroy') h.view.destroy();
        h.host.querySelector('.answer-reader-copy-code')?.dispatch('click'); h.host.querySelectorAll('button').find(node => node.textContent === 'Copy excerpt')?.dispatch('click');
        assert.equal(writes.length, 1); assert.equal(h.view.copying, true, 'lifecycle changes cannot release the original write lock');
        feedback.textContent = 'Newer reader feedback';
        if (outcome === 'resolve') resolve(); else reject(Error('blocked')); await tick();
        assert.equal(h.view.copying, false); assert.equal(feedback.textContent, 'Newer reader feedback'); assert.equal(writes.length, 1);
        if (change === 'bfcache' || change === 'switch') assert.equal(h.host.querySelector('.answer-reader-copy-status').textContent, '');
        h.c.dispose();
    });
}
test('saved code copy recovers navigation after busy state and keeps failure feedback local', async () => {
    for (const clipboard of [undefined, { writeText() { throw Error('blocked'); } }, { writeText: () => Promise.reject(Error('blocked')) }]) {
        const h = await historicalPromptFixture({ safeReader: true, body: collectionCodeSource }); h.view.clipboard = clipboard;
        const reader = h.host.querySelector('.answer-reader'), blocks = reader.querySelectorAll('.answer-reader-copy-code');
        h.c.busy = true; h.view.render(); assert(reader.querySelectorAll('button').every(node => node.disabled));
        h.c.busy = false; h.view.render(); assert(reader.querySelectorAll('button').every(node => !node.disabled));
        const page = h.view.status.textContent, before = h.h.writes;
        blocks[0].dispatch('click'); await tick();
        assert.match(reader.querySelector('.answer-reader-copy-status').textContent, /Select this code/);
        assert.equal(h.view.status.textContent, page); assert.equal(h.h.writes, before); assert.equal(blocks[0].disabled, false); h.c.dispose();
    }
});


test('failed or pending collection reads block every copy entry and clear no saved text', async () => {
    const h = await historicalPromptFixture({ safeReader: true, body: collectionCodeSource }), writes = [];
    h.view.clipboard = { writeText: async value => writes.push(value) };
    const original = h.c.record(), read = h.store.read.bind(h.store);
    const tryCopies = () => {
        h.host.querySelector('.answer-reader-copy-code').dispatch('click');
        h.host.querySelectorAll('button').find(node => node.textContent === 'Copy excerpt').dispatch('click');
        h.host.querySelectorAll('button').find(node => node.textContent === 'Copy historical prompt').dispatch('click');
    };
    h.c.error = { scope: 'read', code: 'READ' }; h.view.render(); tryCopies(); await tick();
    assert.deepEqual(writes, []); assert.equal(h.host.querySelector('.answer-reader-copy-code').disabled, true);
    h.c.error = null; h.view.render(); let finish;
    h.store.read = () => new Promise(resolve => { finish = resolve; });
    const refreshing = h.c.refresh();
    assert.equal(h.c.pendingReadGeneration, h.c.readGeneration); assert.equal(h.host.querySelector('.answer-reader-copy-code').disabled, true);
    tryCopies(); await tick(); assert.deepEqual(writes, []);
    finish(await read()); await refreshing; h.store.read = read;
    assert.equal(h.host.querySelector('.answer-reader-copy-code').disabled, false);
    assert.equal(h.c.record().body, original.body); assert.equal(h.c.record().history[0].body, original.body); h.c.dispose();
});
test('copy controls retain keyboard focus while pending and never steal focus when a write settles', async () => {
    const h = await historicalPromptFixture({ safeReader: true, body: collectionCodeSource }); let finish;
    h.view.clipboard = { writeText: () => new Promise(resolve => { finish = resolve; }) };
    const reader = h.host.querySelector('.answer-reader'), block = reader.querySelector('.answer-reader-copy-code');
    const whole = h.host.querySelectorAll('button').find(node => node.textContent === 'Copy excerpt');
    h.open.dispatch('click');
    for (const [control, expected] of [[block, reader.querySelector('pre')], [whole, h.view.status], [h.copy, h.prompt]]) {
        control.focus(); assert.equal(h.doc.activeElement, control); control.dispatch('click');
        assert.equal(h.doc.activeElement, expected); h.view.search.focus(); finish(); await tick();
        assert.equal(h.doc.activeElement, h.view.search);
    }
    h.c.dispose();
});
