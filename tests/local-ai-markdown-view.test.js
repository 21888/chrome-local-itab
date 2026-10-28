const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PromptCore = require('../shared/local-prompts-store.js');
const CollectionCore = require('../shared/local-ai-collections-store.js');
const prompts = require('./helpers/prompts-harness.js');
const collections = require('./helpers/collections-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');

const implementations = [
    { kind: 'prompt', harness: prompts, view: 'local-prompts-view.js', namespace: 'LocalItabPromptsView', filename: 'local-itab-prompt.md' },
    { kind: 'collection', harness: collections, view: 'local-ai-collections-view.js', namespace: 'LocalItabCollectionsView', filename: 'local-itab-collection.md' }
];
const clone = value => JSON.parse(JSON.stringify(value));
const sourceUrl = 'https://example.com/private/conversation?token=sensitive-source-only';
const savedBody = '  Exact current 中文 🧪 {{topic}}\r\n<script>alert("literal")</script>\n```\n\\path\t  ';
const savedNotes = '  Saved annotation 中文 🧪\r\n<em>literal notes</em>  ';

async function mount(implementation, aggregateTextContent = false) {
    const h = implementation.harness.setup();
    const doc = createDocument({ blurUnavailableFocus: true, aggregateTextContent });
    doc.documentElement.lang = 'en';
    const host = doc.createElement('div'); doc.body.append(host);
    const downloads = { blobs: [], clicks: [], revoked: [], anchors: [] }, events = new Map();
    const root = {
        document: doc, navigator: { clipboard: { writeText: async () => {} } },
        LocalItabPrompts: PromptCore, LocalItabAICollections: CollectionCore,
        addEventListener(name, handler) { events.set(name, handler); }, removeEventListener(name) { events.delete(name); }, location: { assign() {} }, Blob,
        URL: {
            createObjectURL(blob) { downloads.blobs.push(blob); return `blob:markdown-${downloads.blobs.length}`; },
            revokeObjectURL(url) { downloads.revoked.push(url); }
        }
    };
    const createElement = doc.createElement;
    doc.createElement = tag => {
        const node = createElement(tag);
        if (tag === 'a') {
            downloads.anchors.push(node);
            node.click = () => downloads.clicks.push({ href: node.href, filename: node.download, connected: node.isConnected });
        }
        return node;
    };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise, Map });
    for (const filename of ['dialog-focus.js', 'local-ai-markdown.js', implementation.view]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', filename), 'utf8'), context);
    }
    const view = new root[implementation.namespace].View({ host, controller: h.controller });
    view.attachDepartureGuard(); view.render(); await h.controller.start(); await implementation.harness.settle(h.controller);
    return { ...h, h, doc, host, root, view, downloads, events, implementation };
}

async function seed(h, { source = true } = {}) {
    const c = h.controller, api = h.implementation.harness;
    const other = await api.add(c, 'Unselected record', 'UNSELECTED_RECORD_SECRET');
    await api.add(c, '../../ hostile 中文 🧪 <img onerror=alert(1)>', 'HISTORICAL_BODY_SECRET {{topic}}');
    if (h.implementation.kind === 'prompt') {
        c.setVariable('topic', 'EPHEMERAL_VARIABLE_SECRET');
        c.edit(); c.update('body', savedBody); c.update('category', 'Examples'); c.update('tool', 'Local note');
        c.update('tagsText', 'tag-one, 中文'); assert.equal(await c.save(), true);
    } else {
        c.edit(); c.update('notes', savedNotes); c.update('tool', 'Local model label');
        c.update('sourceUrl', source ? sourceUrl : ''); c.update('tagsText', 'tag-one, 中文');
        assert.equal(await c.save(), true);
        await api.settle(c);
        const plan = await c.reviewBody(savedBody); assert.ok(plan); assert.equal(await c.acceptRevision(plan), true);
    }
    await api.settle(c);
    const saved = clone(c.record());
    c.edit(other.id); c.update('title', 'UNSAVED_DRAFT_SECRET'); c.update('body', 'UNSAVED_DRAFT_BODY_SECRET'); c.select(saved.id);
    if (h.implementation.kind === 'collection') {
        h.view.proposals.set(saved.id, 'UNACCEPTED_PROPOSAL_SECRET');
        h.view.revisionDraft = 'UNACCEPTED_REVISION_SECRET';
        h.view.render();
    } else {
        assert.match(c.preview().text, /HISTORICAL_BODY_SECRET EPHEMERAL_VARIABLE_SECRET/,
            'exercise a retained old-body session rather than the saved current template');
        h.view.historyId = saved.history[0].id;
    }
    return { saved, other };
}

function review(h) {
    const options = [];
    const pending = deferred();
    h.view.dialog = input => { options.push(input); return pending.promise; };
    return { options, ...pending };
}
function assertNoDownload(h) {
    assert.equal(h.downloads.blobs.length, 0);
    assert.equal(h.downloads.clicks.length, 0);
}
function assertNoWrite(h, before, writes) {
    assert.deepEqual(h.h.raw, before, 'saved library and recovery data stay byte-for-byte unchanged');
    assert.equal(h.h.writes, writes, 'Markdown export never writes through the backend');
}
async function downloadedText(h, index = 0) {
    const blob = h.downloads.blobs[index];
    assert.equal(blob.type, 'text/markdown;charset=utf-8');
    const bytes = Buffer.from(await blob.arrayBuffer());
    const result = bytes.toString('utf8');
    assert.deepEqual(Buffer.from(result, 'utf8'), bytes, 'download is valid UTF-8 without encoding loss');
    return result;
}

for (const implementation of implementations) {
    const { kind, filename } = implementation;
    test(`${kind}: explicit Markdown download exports the current saved literal only, with fixed filename and no writes`, async () => {
        const h = await mount(implementation), c = h.controller;
        const { saved } = await seed(h), before = h.h.raw, writes = h.h.writes;
        const dialog = review(h), pending = h.view.exportMarkdown();
        assert.equal(dialog.options.length, 1);
        assertNoDownload(h);
        const options = dialog.options[0];
        assert.match(options.body, /unencrypted|readable/i);
        assert.match(options.body, /not a recovery backup/i);
        assert.match(options.body, /Unsaved work and history are excluded/);
        assert.ok(options.body.includes(saved.title));
        assert.ok(options.body.includes(saved.id));
        assert.ok(options.body.includes(saved.version));
        assert.ok(options.body.includes(saved.currentVersionId));
        assert.ok(options.markdownPreview.includes(savedBody));
        assert.ok(!options.markdownPreview.includes(sourceUrl), 'source URL is omitted from initial review');
        dialog.resolve(true); await pending;
        assert.equal(h.downloads.blobs.length, 1);
        const result = await downloadedText(h);
        assert.ok(result.includes(savedBody), 'saved literal whitespace, placeholders, code and Unicode are intact');
        if (kind === 'collection') assert.ok(result.includes(savedNotes));
        for (const secret of ['EPHEMERAL_VARIABLE_SECRET', 'HISTORICAL_BODY_SECRET', 'UNSELECTED_RECORD_SECRET', 'UNSAVED_DRAFT_SECRET', 'UNSAVED_DRAFT_BODY_SECRET', 'UNACCEPTED_PROPOSAL_SECRET', 'UNACCEPTED_REVISION_SECRET', sourceUrl]) {
            assert.ok(!result.includes(secret), `${secret} is excluded`);
        }
        assert.equal(result, h.root.LocalItabAIMarkdown.serialize(kind, saved, { includeSourceUrl: false }));
        assert.deepEqual(h.downloads.clicks, [{ href: 'blob:markdown-1', filename, connected: true }]);
        assert.deepEqual(h.downloads.revoked, ['blob:markdown-1']);
        assert.equal(h.downloads.anchors.filter(node => node.download === filename && node.isConnected).length, 0);
        assert.match((h.view.markdownStatus || h.view.status).textContent, /Download requested/);
        assert.equal(h.view.exportingMarkdown, false);
        assertNoWrite(h, before, writes); c.dispose();
    });

    test(`${kind}: duplicate export calls open one review, cancellation downloads nothing, and later export remains possible`, async () => {
        const h = await mount(implementation), c = h.controller; await seed(h);
        const before = h.h.raw, writes = h.h.writes, dialog = review(h);
        const first = h.view.exportMarkdown(); await h.view.exportMarkdown();
        assert.equal(dialog.options.length, 1); assertNoDownload(h);
        dialog.resolve(false); await first;
        assertNoDownload(h); assert.equal(h.view.exportingMarkdown, false);
        const next = review(h), second = h.view.exportMarkdown(); next.resolve(true); await second;
        assert.equal(next.options.length, 1); assert.equal(h.downloads.clicks.length, 1);
        assertNoWrite(h, before, writes); c.dispose();
    });

    for (const gate of ['no record', 'busy', 'pendingCommand', 'error', 'draft', 'disposed', 'openDialog']) {
        test(`${kind}: export is blocked before review when ${gate}`, async () => {
            const h = await mount(implementation), c = h.controller;
            if (gate !== 'no record') await seed(h);
            if (gate === 'busy') c.busy = true;
            if (gate === 'pendingCommand') c.pendingCommand = { action: 'save' };
            if (gate === 'error') c.error = { code: 'READ', scope: 'read' };
            if (gate === 'draft') c.edit();
            if (gate === 'disposed') c.dispose();
            if (gate === 'openDialog') h.view.openDialog = true;
            const before = h.h.raw, writes = h.h.writes, dialog = review(h);
            await h.view.exportMarkdown();
            assert.equal(dialog.options.length, 0); assertNoDownload(h); assertNoWrite(h, before, writes);
            c.dispose();
        });
    }

    for (const change of ['selection', 'selection round trip', 'version', 'version round trip', 'busy', 'pendingCommand', 'error', 'draft', 'disposed']) {
        test(`${kind}: accepted asynchronous review is discarded after ${change}, without stale status or writes`, async () => {
            const h = await mount(implementation), c = h.controller;
            const { saved, other } = await seed(h), before = h.h.raw, writes = h.h.writes;
            const dialog = review(h), pending = h.view.exportMarkdown();
            if (change === 'selection' || change === 'selection round trip') {
                c.select(other.id); if (change.endsWith('round trip')) c.select(saved.id);
            }
            if (change === 'version' || change === 'version round trip') {
                c.record().version = 'changed_saved_version';
                if (change.endsWith('round trip')) { c.notify(); c.record().version = saved.version; c.notify(); }
            }
            if (change === 'busy') c.busy = true;
            if (change === 'pendingCommand') c.pendingCommand = { action: 'save' };
            if (change === 'error') c.error = { code: 'READ', scope: 'read' };
            if (change === 'draft') c.edit();
            if (change === 'disposed') c.dispose();
            h.view.status.textContent = 'CURRENT_STATUS_MUST_SURVIVE';
            h.view.search.focus(); const focused = h.doc.activeElement;
            dialog.resolve(true); await pending;
            assertNoDownload(h);
            assert.equal(h.view.status.textContent, 'CURRENT_STATUS_MUST_SURVIVE');
            assert.equal(h.doc.activeElement, focused);
            assert.equal(h.view.exportingMarkdown, false);
            assertNoWrite(h, before, writes); c.dispose();
        });
    }

    for (const failure of ['serializer', 'dialog', 'Blob', 'createObjectURL', 'click', 'revokeObjectURL']) {
        test(`${kind}: ${failure} failure cleans temporary resources and releases the download guard`, async () => {
            const h = await mount(implementation), c = h.controller; await seed(h);
            const before = h.h.raw, writes = h.h.writes;
            h.view.dialog = async () => true;
            const fail = () => { throw new Error(`injected ${failure} failure`); };
            if (failure === 'serializer') h.root.LocalItabAIMarkdown = { serialize: fail };
            if (failure === 'dialog') h.view.dialog = fail;
            if (failure === 'Blob') h.root.Blob = class { constructor() { fail(); } };
            if (failure === 'createObjectURL') h.root.URL.createObjectURL = fail;
            if (failure === 'revokeObjectURL') h.root.URL.revokeObjectURL = url => { h.downloads.revoked.push(url); fail(); };
            if (failure === 'click') {
                const createElement = h.doc.createElement;
                h.doc.createElement = tag => { const node = createElement(tag); if (tag === 'a') node.click = fail; return node; };
            }
            await assert.doesNotReject(h.view.exportMarkdown());
            assert.equal(h.view.exportingMarkdown, false);
            assert.equal(h.downloads.anchors.filter(node => node.download === filename && node.isConnected).length, 0);
            if (failure === 'click' || failure === 'revokeObjectURL') assert.deepEqual(h.downloads.revoked, ['blob:markdown-1']);
            if (failure !== 'revokeObjectURL') {
                assert.equal(h.downloads.clicks.length, 0);
                assert.match((h.view.markdownStatus || h.view.status).textContent, /Markdown export could not be requested/);
            }
            assertNoWrite(h, before, writes); c.dispose();
        });
    }

    test(`${kind}: stale dialog rejection never overwrites the newly selected detail status`, async () => {
        const h = await mount(implementation), c = h.controller;
        const { other } = await seed(h); let reject;
        h.view.dialog = () => new Promise((resolve, no) => { reject = no; });
        const before = h.h.raw, writes = h.h.writes, pending = h.view.exportMarkdown();
        c.select(other.id); h.view.status.textContent = 'NEW_DETAIL_STATUS';
        reject(new Error('dialog interrupted')); await pending;
        assertNoDownload(h); assert.equal(h.view.status.textContent, 'NEW_DETAIL_STATUS');
        assert.equal(h.view.exportingMarkdown, false); assertNoWrite(h, before, writes); c.dispose();
    });

    test(`${kind}: a selection change during URL creation cancels the click and cleans up the object URL`, async () => {
        const h = await mount(implementation), c = h.controller;
        const { other } = await seed(h), before = h.h.raw, writes = h.h.writes;
        const createObjectURL = h.root.URL.createObjectURL;
        h.root.URL.createObjectURL = blob => { const url = createObjectURL(blob); c.select(other.id); h.view.status.textContent = 'CHANGED_BEFORE_CLICK'; return url; };
        h.view.dialog = async () => true; await h.view.exportMarkdown();
        assert.equal(h.downloads.blobs.length, 1); assert.equal(h.downloads.clicks.length, 0);
        assert.deepEqual(h.downloads.revoked, ['blob:markdown-1']);
        assert.equal(h.downloads.anchors.filter(node => node.download === filename && node.isConnected).length, 0);
        assert.equal(h.view.status.textContent, 'CHANGED_BEFORE_CLICK');
        assert.equal(h.view.exportingMarkdown, false); assertNoWrite(h, before, writes); c.dispose();
    });

    for (const timing of ['before review', 'during review', 'finished during review']) {
        test(`${kind}: external refresh ${timing} cannot export a possibly stale saved snapshot`, async () => {
            const h = await mount(implementation), c = h.controller; await seed(h);
            const nextState = await h.store.read(), originalRead = h.store.read.bind(h.store);
            const wait = deferred(), before = h.h.raw, writes = h.h.writes, dialog = review(h);
            h.store.read = () => wait.promise;
            let pending, refresh;
            if (timing === 'before review') {
                refresh = c.refresh(); pending = h.view.exportMarkdown();
                await pending; assert.equal(dialog.options.length, 0, 'no review starts while a read is pending');
            } else {
                pending = h.view.exportMarkdown(); assert.equal(dialog.options.length, 1);
                refresh = c.refresh();
                if (timing === 'finished during review') { wait.resolve(nextState); await refresh; }
                h.view.status.textContent = 'CURRENT_REFRESH_STATUS';
                dialog.resolve(true); await pending;
                assert.equal(h.view.status.textContent, 'CURRENT_REFRESH_STATUS');
            }
            assertNoDownload(h);
            wait.resolve(nextState); await refresh;
            h.store.read = originalRead;
            const nextDialog = review(h), explicit = h.view.exportMarkdown();
            assert.equal(nextDialog.options.length, 1); nextDialog.resolve(true); await explicit;
            assert.equal(h.downloads.clicks.length, 1, 'a fresh explicit review works after the read settles');
            assertNoWrite(h, before, writes); c.dispose();
        });
    }

    test(`${kind}: persisted pagehide cancels an open review and never resumes its download after navigation back`, async () => {
        const h = await mount(implementation), c = h.controller; await seed(h);
        const before = h.h.raw, writes = h.h.writes, pending = h.view.exportMarkdown();
        const overlay = h.doc.body.querySelector('.prompt-dialog-overlay'); assert.ok(overlay);
        const staleAccept = overlay.querySelector('.prompt-primary');
        assert.equal(typeof h.events.get('pagehide'), 'function');
        h.view.status.textContent = 'STATUS_BEFORE_NAVIGATION';
        h.events.get('pagehide')({ persisted: true });
        await pending;
        assert.equal(h.view.openDialog, false); assert.equal(h.view.exportingMarkdown, false);
        assert.equal(h.doc.body.querySelector('.prompt-dialog-overlay'), null);
        assert.equal(h.host.inert, false); assertNoDownload(h);
        h.events.get('pageshow')?.({ persisted: true }); staleAccept.dispatch('click');
        await implementation.harness.tick(); assertNoDownload(h);
        assert.equal(h.view.status.textContent, 'STATUS_BEFORE_NAVIGATION');
        const next = h.view.exportMarkdown();
        h.doc.body.querySelector('.prompt-dialog-overlay .prompt-primary').dispatch('click'); await next;
        assert.equal(h.downloads.clicks.length, 1, 'only a new explicit review may request a download');
        assertNoWrite(h, before, writes); c.dispose();
    });

    test(`${kind}: controller disposal during a real review suppresses stale download, status, and opener focus`, async () => {
        const h = await mount(implementation), c = h.controller; await seed(h);
        const before = h.h.raw, writes = h.h.writes;
        const opener = h.view.main.querySelectorAll('button').find(node => node.textContent === 'Export current saved item as Markdown');
        opener.focus(); const pending = h.view.exportMarkdown();
        const overlay = h.doc.body.querySelector('.prompt-dialog-overlay'); assert.ok(overlay);
        c.dispose(); h.view.status.textContent = 'DISPOSED_STATUS';
        overlay.querySelector('.prompt-primary').dispatch('click'); await pending;
        assertNoDownload(h); assert.equal(h.view.status.textContent, 'DISPOSED_STATUS');
        assert.notEqual(h.doc.activeElement, opener, 'closing an invalidated review cannot focus the disposed detail');
        assert.equal(h.view.openDialog, false); assert.equal(h.host.inert, false);
        assert.equal(h.view.exportingMarkdown, false); assertNoWrite(h, before, writes);
    });

    test(`${kind}: unrelated dialogs still focus Cancel initially`, async () => {
        const h = await mount(implementation), c = h.controller; await seed(h);
        h.view.search.focus(); const opener = h.doc.activeElement;
        const pending = h.view.dialog({ title: 'Other confirmation', body: 'Review another action.', accept: 'Proceed' });
        const overlay = h.doc.body.querySelector('.prompt-dialog-overlay');
        const cancel = overlay.querySelectorAll('button').find(node => node.textContent === 'Cancel');
        assert.equal(h.doc.activeElement, cancel);
        cancel.dispatch('keydown', { key: 'Escape' }); assert.equal(await pending, false);
        assert.equal(h.doc.activeElement, opener); assertNoDownload(h); c.dispose();
    });

    test(`${kind}: real Markdown review is inert, plain text, Escape-cancellable, and restores opener focus`, async () => {
        const h = await mount(implementation), c = h.controller; await seed(h);
        const before = h.h.raw, writes = h.h.writes;
        const opener = h.view.main.querySelectorAll('button').find(node => node.textContent === 'Export current saved item as Markdown');
        assert.ok(opener); opener.focus();
        const pending = h.view.exportMarkdown();
        const overlay = h.doc.body.querySelector('.prompt-dialog-overlay'); assert.ok(overlay);
        assert.equal(h.host.inert, true);
        assert.equal(overlay.querySelector('[role="dialog"]').getAttribute('aria-modal'), 'true');
        assert.equal(overlay.querySelectorAll('img, script, iframe').length, 0);
        assert.ok(overlay.querySelector('pre').textContent.includes(savedBody));
        const cancel = overlay.querySelectorAll('button').find(node => node.textContent === 'Cancel');
        const heading = overlay.querySelector('h2');
        assert.ok(h.doc.activeElement === heading, 'review starts at its scope and privacy introduction');
        assert.equal(heading.tabIndex, -1, 'static introduction is not a repeated Tab stop');
        assert.ok(overlay.querySelector('p').textContent.includes('unencrypted'));
        const proceed = overlay.querySelector('.prompt-primary'), preview = overlay.querySelector('pre');
        const backward = heading.dispatch('keydown', { key: 'Tab', shiftKey: true });
        assert.equal(backward.prevented, true); assert.ok(h.doc.activeElement === proceed);
        proceed.dispatch('keydown', { key: 'Tab' }); assert.ok(h.doc.activeElement === preview);
        preview.dispatch('keydown', { key: 'Tab', shiftKey: true }); assert.ok(h.doc.activeElement === proceed);
        heading.focus();
        const forward = heading.dispatch('keydown', { key: 'Tab' });
        assert.equal(forward.prevented, false, 'forward Tab uses native order from heading to preview');
        const checkbox = overlay.querySelector('input');
        if (kind === 'collection') { assert.ok(checkbox); assert.equal(checkbox.checked, false); }
        else assert.equal(checkbox, null);
        heading.dispatch('keydown', { key: 'Escape', isComposing: true });
        assert.equal(h.view.openDialog, true, 'IME Escape never dismisses the export review');
        heading.dispatch('keydown', { key: 'Escape' }); await pending;
        assert.equal(h.view.openDialog, false); assert.equal(h.host.inert, false);
        assert.equal(h.doc.activeElement, opener);
        assert.equal(h.doc.body.querySelector('.prompt-dialog-overlay'), null);
        assertNoDownload(h); assertNoWrite(h, before, writes); c.dispose();
    });
}

for (const includeSourceUrl of [false, true]) {
    test(`collection: source URL is ${includeSourceUrl ? 'included only after explicit opt-in' : 'omitted by default'} in the downloaded Markdown`, async () => {
        const h = await mount(implementations[1]), c = h.controller;
        const { saved } = await seed(h), before = h.h.raw, writes = h.h.writes;
        const pending = h.view.exportMarkdown(), overlay = h.doc.body.querySelector('.prompt-dialog-overlay');
        const checkbox = overlay.querySelector('input');
        assert.equal(checkbox.checked, false);
        assert.ok(!overlay.querySelector('pre').textContent.includes(sourceUrl));
        const sourcePreview = overlay.querySelectorAll('pre').find(node => node.textContent === sourceUrl);
        assert.ok(sourcePreview); assert.equal(sourcePreview.hidden, true);
        if (includeSourceUrl) { checkbox.checked = true; checkbox.dispatch('change'); assert.equal(sourcePreview.hidden, false); }
        overlay.querySelector('.prompt-primary').dispatch('click'); await pending;
        const result = await downloadedText(h);
        assert.equal(result.includes(sourceUrl), includeSourceUrl);
        assert.equal(result, h.root.LocalItabAIMarkdown.serialize('collection', saved, { includeSourceUrl }));
        assert.ok(result.includes(savedNotes), 'saved annotations are preserved regardless of source opt-in');
        assertNoWrite(h, before, writes); c.dispose();
    });
}

test('collection: source opt-in is reset for every export review, including after cancellation', async () => {
    const h = await mount(implementations[1]), c = h.controller; await seed(h);
    const before = h.h.raw, writes = h.h.writes;
    let pending = h.view.exportMarkdown(), overlay = h.doc.body.querySelector('.prompt-dialog-overlay');
    let checkbox = overlay.querySelector('input'); checkbox.checked = true; checkbox.dispatch('change');
    overlay.querySelectorAll('button').find(node => node.textContent === 'Cancel').dispatch('click'); await pending;
    assertNoDownload(h);
    pending = h.view.exportMarkdown(); overlay = h.doc.body.querySelector('.prompt-dialog-overlay'); checkbox = overlay.querySelector('input');
    assert.equal(checkbox.checked, false); overlay.querySelector('.prompt-primary').dispatch('click'); await pending;
    assert.ok(!(await downloadedText(h)).includes(sourceUrl));
    assertNoWrite(h, before, writes); c.dispose();
});

test('collection: no source opt-in appears when the saved item has no source URL', async () => {
    const h = await mount(implementations[1]), c = h.controller; await seed(h, { source: false });
    const pending = h.view.exportMarkdown(), overlay = h.doc.body.querySelector('.prompt-dialog-overlay');
    assert.equal(overlay.querySelector('input'), null);
    overlay.querySelector('.prompt-primary').dispatch('click'); await pending;
    assert.equal(h.downloads.clicks.length, 1); c.dispose();
});

for (const implementation of implementations.filter(item => item.kind === 'prompt')) {
    for (const outcome of ['success', 'failure']) test(`${implementation.kind}: saved-item Markdown ${outcome} preserves other unsaved draft warning`, async () => {
        const h = await mount(implementation, true), c = h.controller;
        await seed(h);
        const before = h.h.raw, writes = h.h.writes;
        const warning = h.view.status.textContent;
        assert.match(warning, /Unsaved drafts/);
        const drafts = [...c.drafts.entries()].map(([id, draft]) => [id, clone(draft)]);
        h.view.dialog = async () => true;
        if (outcome === 'failure') h.root.URL.createObjectURL = () => { throw new Error('synthetic Blob URL failure'); };
        await h.view.exportMarkdown();
        assert.equal(h.view.status.textContent, warning, 'export feedback must not replace the unsaved-work warning');
        assert.match(h.view.markdownStatus.textContent, outcome === 'success' ? /Download requested/ : /could not be requested/);
        assert.equal(h.view.markdownStatus.classList.contains('error'), outcome === 'failure');
        assert.deepEqual([...c.drafts.entries()].map(([id, draft]) => [id, clone(draft)]), drafts);
        assert.equal(h.downloads.clicks.length, outcome === 'success' ? 1 : 0);
        assertNoWrite(h, before, writes); c.dispose();
    });
}

test('prompt: failed Markdown request, Cancel and explicit retry keep draft warning and distinct feedback', async () => {
    const h = await mount(implementations[0], true), c = h.controller; await seed(h);
    const warning = h.view.status.textContent, before = h.h.raw, writes = h.h.writes;
    const originalCreate = h.root.URL.createObjectURL;
    h.root.URL.createObjectURL = () => { throw new Error('synthetic URL failure'); };
    const accept = () => h.doc.body.querySelector('.prompt-dialog-overlay').querySelector('.prompt-primary').dispatch('click');
    let pending = h.view.exportMarkdown(); accept(); await pending;
    const failure = h.view.markdownStatus.textContent;
    assert.match(failure, /could not be requested/); assert.equal(h.view.status.textContent, warning);
    pending = h.view.exportMarkdown();
    h.doc.body.querySelector('.prompt-dialog-overlay').querySelector('button').dispatch('click'); await pending;
    assert.equal(h.view.markdownStatus.textContent, failure); assert.equal(h.view.status.textContent, warning);
    assert.equal(h.downloads.clicks.length, 0);
    h.root.URL.createObjectURL = originalCreate;
    pending = h.view.exportMarkdown(); accept(); await pending;
    assert.match(h.view.markdownStatus.textContent, /Download requested/);
    assert.doesNotMatch(h.view.markdownStatus.textContent, /could not be requested/);
    assert.equal(h.view.markdownStatus.classList.contains('error'), false);
    assert.equal(h.view.markdownStatus.getAttribute('role'), 'status');
    assert.equal(h.view.markdownStatus.getAttribute('aria-live'), 'polite');
    assert.equal(h.view.status.textContent, warning); assert.equal(c.draftCount(), 1);
    assert.equal(h.downloads.clicks.length, 1); assertNoWrite(h, before, writes); c.dispose();
});

for (const settle of ['accept', 'reject']) test(`prompt: newer selection clears old Markdown feedback and stale ${settle} cannot replace current warning`, async () => {
    const h = await mount(implementations[0], true), c = h.controller; const { other } = await seed(h);
    const before = h.h.raw, writes = h.h.writes, originalDialog = h.view.dialog;
    h.view.dialog = async () => true; await h.view.exportMarkdown();
    assert.match(h.view.markdownStatus.textContent, /Download requested/);
    const pendingReview = {}; pendingReview.promise = new Promise((resolve, reject) => Object.assign(pendingReview, { resolve, reject })); h.view.dialog = () => pendingReview.promise;
    const pending = h.view.exportMarkdown(); c.select(other.id);
    assert.equal(h.view.markdownStatus.textContent, '');
    const warning = h.view.status.textContent, draft = clone(c.draft());
    if (settle === 'accept') pendingReview.resolve(true); else pendingReview.reject(new Error('stale review'));
    await pending;
    assert.equal(h.view.markdownStatus.textContent, ''); assert.equal(h.view.status.textContent, warning);
    assert.deepEqual(clone(c.draft()), draft); assert.equal(h.downloads.clicks.length, 1);
    h.view.dialog = originalDialog; assertNoWrite(h, before, writes); c.dispose();
});
