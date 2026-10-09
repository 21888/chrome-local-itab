const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const parser = require('../shared/bookmark-import');
const source = fs.readFileSync('shared/bookmark-import-view.js', 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const fixture = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><H3>Research &amp; notes</H3><DL><DT><A HREF="https://example.com">Example</A></DL></DL>';
const failure = code => Object.assign(new Error('Do not expose private error text'), { code });
function preview(overrides = {}) {
    return { snapshot: { privacy: { syncEnabled: false, onlineFavicons: false } }, plan: { preview: {
        encounteredBookmarks: 3, addedBookmarks: 1, skippedBookmarks: 2, newCategories: 1,
        skippedReasons: { duplicate_url: 1, invalid_url: 1 },
        folderMapping: [{ sourceNodeId: 'f1', sourcePath: 'Research', categoryName: 'Research (2)' }], ...overrides
    } } };
}
function model({ lang = 'en', i18n, chrome } = {}) {
    const document = createDocument(); document.documentElement.lang = lang;
    const host = document.createElement('div'); document.body.append(host);
    const fake = { reads: [], writes: [], value: preview(), async prepare(text) { this.reads.push(text); return this.value; }, async apply(value) { this.writes.push(value); return { applied: true, addedBookmarks: value.plan.preview.addedBookmarks, newCategories: value.plan.preview.newCategories }; } };
    const window = { i18n, chrome };
    const forbidden = () => { throw Error('Forbidden network or HTML parsing'); };
    vm.runInNewContext(source, { window, fetch: forbidden, DOMParser: forbidden, XMLHttpRequest: forbidden, Image: forbidden });
    const view = window.LocalItabBookmarkImportView.mount(host, { prepare: text => fake.prepare(text), apply: value => fake.apply(value) });
    const [choose, apply, cancel] = host.querySelectorAll('button');
    for (const node of [choose, apply, cancel]) {
        const dispatch = node.dispatch.bind(node);
        node.dispatch = (type, fields) => { if (type === 'click' && !node.disabled) node.focus(); return dispatch(type, fields); };
    }
    const file = host.querySelector('input'), panel = host.querySelector('.bookmark-import-preview');
    file.click = () => { fake.pickerCalls = (fake.pickerCalls || 0) + 1; };
    const select = (text = fixture, options = {}) => {
        choose.focus();
        const selected = { size: Buffer.byteLength(text), async text() { fake.fileReads = (fake.fileReads || 0) + 1; return text; }, ...options };
        file.files = [selected]; file.value = 'C:\\fakepath\\bookmarks.html'; file.dispatch('change'); return selected;
    };
    return { window, document, host, fake, view, choose, apply, cancel, file, panel, select,
        status: host.querySelector('.bookmark-import-status'), summary: host.querySelector('.bookmark-import-summary') };
}

test('actual view: local picker previews plain counts, reasons, folder mapping and privacy before explicit apply', async () => {
    const m = model(); assert(m.panel.hidden); assert.equal(m.view.hasUncommittedWork(), false);
    m.choose.dispatch('click'); assert.equal(m.fake.pickerCalls, 1); assert.equal(m.fake.reads.length, 0);
    m.select(); await flush();
    assert.equal(m.file.value, ''); assert.equal(m.fake.fileReads, 1); assert.deepEqual(m.fake.reads, [fixture]); assert.equal(m.fake.writes.length, 0);
    assert.equal(m.panel.hidden, false); assert.equal(m.document.activeElement, m.summary); assert(m.view.hasUncommittedWork());
    assert.deepEqual(m.host.querySelectorAll('.bookmark-import-counts li').map(node => node.textContent), ['Bookmarks in file: 3', 'New sites: 1', 'Skipped bookmarks: 2', 'New categories: 1']);
    assert.deepEqual(m.host.querySelectorAll('.bookmark-import-reasons li').map(node => node.textContent), ['Already saved or repeated URL: 1', 'Unsupported or invalid URL: 1']);
    assert.equal(m.host.querySelector('.bookmark-import-mapping li').textContent, 'Research → Research (2)');
    assert.match(m.host.querySelector('.bookmark-import-privacy p').textContent, /Chrome Sync: Off · Online site icons: Off/);
    assert.match(m.host.querySelectorAll('.bookmark-import-privacy p')[1].textContent, /uploaded to Chrome Sync.*third-party.*does not change/);
    m.apply.dispatch('click'); m.apply.dispatch('click'); await flush();
    assert.equal(m.fake.writes.length, 1); assert.equal(m.fake.writes[0], m.fake.value); assert(m.panel.hidden);
    assert.match(m.status.textContent, /Bookmarks added: 1/); assert.equal(m.document.activeElement, m.status); assert.equal(m.view.hasUncommittedWork(), false);
});

test('file metadata blocks oversized or invalid files before text() and permits the exact 10 MiB boundary', async () => {
    for (const size of [10 * 1024 * 1024 + 1, Infinity, -1, undefined]) {
        const m = model(); m.select(fixture, { size }); await flush();
        assert.equal(m.fake.fileReads || 0, 0); assert.equal(m.fake.reads.length, 0); assert.equal(m.fake.writes.length, 0);
        assert.match(m.status.textContent, /10 MiB/); assert(m.panel.hidden); assert.equal(m.document.activeElement, m.status);
    }
    const m = model(); m.select(fixture, { size: 10 * 1024 * 1024 }); await flush(); assert.equal(m.fake.fileReads, 1); assert.equal(m.fake.reads.length, 1);
});

test('Cancel and Escape restore focus and stop delayed file reads before prepare; selecting the same file is possible again', async () => {
    for (const method of ['cancel', 'escape', 'close']) {
        const m = model(), wait = deferred(); m.select(fixture, { text: () => wait.promise }); await flush();
        assert(!m.cancel.disabled); assert(m.apply.disabled);
        if (method === 'cancel') m.cancel.dispatch('click');
        else if (method === 'escape') m.choose.dispatch('keydown', { key: 'Escape' });
        else assert.equal(m.view.close(), true);
        assert(m.panel.hidden); assert.equal(m.document.activeElement, m.choose); assert.equal(m.view.hasUncommittedWork(), false);
        wait.resolve(fixture); await flush(); assert.equal(m.fake.reads.length, 0); assert.equal(m.fake.writes.length, 0); assert(m.panel.hidden);
        m.select(); await flush(); assert.equal(m.fake.reads.length, 1);
    }
});

test('cancelled delayed preparation cannot reopen; selecting a newer file supersedes stale reads and stale errors', async () => {
    const m = model(), wait = deferred(); m.fake.prepare = async () => { await wait.promise; return preview(); };
    m.select(); await flush(); m.cancel.dispatch('click'); wait.resolve(); await flush(); assert(m.panel.hidden);
    const older = deferred(), newest = preview({ addedBookmarks: 7 });
    m.fake.prepare = async text => { if (text === 'old') { await older.promise; throw failure('MISSING_MARKER'); } return newest; };
    m.select('old'); await flush(); m.select('new'); await flush(); assert.match(m.host.querySelectorAll('.bookmark-import-counts li')[1].textContent, /7/);
    older.resolve(); await flush(); assert(!m.panel.hidden); assert.match(m.summary.textContent, /Review/);
    m.apply.dispatch('click'); await flush(); assert.equal(m.fake.writes[0], newest);
});

test('new selection before an old File.text resolves never prepares the older file', async () => {
    const m = model(), wait = deferred(); m.select('old', { text: () => wait.promise }); await flush();
    m.select('new'); await flush(); wait.resolve('old'); await flush(); assert.deepEqual(m.fake.reads, ['new']);
});

test('pending apply is not dismissed by Cancel, Escape, close, new selection or repeated clicks', async () => {
    const m = model(), wait = deferred(); m.select(); await flush();
    m.fake.apply = async value => { m.fake.writes.push(value); await wait.promise; return { applied: true, addedBookmarks: 1, newCategories: 1 }; };
    m.apply.dispatch('click'); await flush();
    assert(m.cancel.disabled); assert(m.choose.disabled); assert(m.file.disabled); assert(m.apply.disabled);
    assert.equal(m.view.close(), false); m.cancel.dispatch('click');
    const escape = m.apply.dispatch('keydown', { key: 'Escape' }); assert(escape.prevented); assert(escape.stopped);
    m.select('ignored'); m.apply.dispatch('click'); await flush();
    assert(!m.panel.hidden); assert.match(m.status.textContent, /cannot be cancelled/); assert.equal(m.fake.reads.length, 1); assert.equal(m.fake.writes.length, 1);
    wait.resolve(); await flush(); assert(m.panel.hidden); assert.match(m.status.textContent, /Bookmarks added/);
});

test('stale-preview codes and uncertain writes clear the preview without retry or leaking raw error messages', async () => {
    for (const code of ['CONFLICT', 'PRIVACY_CONFLICT', 'CATEGORY_CONFLICT', 'BOOKMARK_IMPORT_PRIVACY_CHANGED', 'UNCONFIRMED', 'BOOKMARK_IMPORT_UNVERIFIED', 'WRITE']) {
        const m = model(); m.select(); await flush(); m.fake.apply = async () => { m.fake.writes.push(true); throw failure(code); };
        m.apply.dispatch('click'); await flush();
        assert(m.panel.hidden); assert(m.apply.disabled); assert(!m.choose.disabled); assert.equal(m.fake.writes.length, 1); assert.equal(m.document.activeElement, m.status);
        assert.match(m.status.textContent, /CONFLICT$/.test(code) || code === 'BOOKMARK_IMPORT_PRIVACY_CHANGED' ? /fresh preview/ : /may have been added/);
        assert(!m.status.textContent.includes('private')); m.apply.dispatch('click'); await flush(); assert.equal(m.fake.writes.length, 1);
    }
});

test('read/parse/limit failures remain local and retryable, with no write', async () => {
    for (const code of ['INPUT_LIMIT', 'ADDITION_LIMIT', 'CATEGORY_LIMIT', 'MISSING_MARKER', 'READ', 'UNAVAILABLE']) {
        const m = model(); m.fake.prepare = async () => { throw failure(code); }; m.select(); await flush();
        assert(m.panel.hidden); assert(m.apply.disabled); assert.equal(m.fake.writes.length, 0); assert(m.status.textContent); assert(!m.status.textContent.includes('private'));
    }
    const m = model(); m.select(fixture, { text: async () => { throw Error('private filesystem path'); } }); await flush();
    assert.match(m.status.textContent, /Could not read this local file/); assert.equal(m.fake.reads.length, 0);
});

test('zero additions cannot be applied, invalid previews fail closed, and mapping is capped at 200 rows', async () => {
    const m = model(); m.fake.value = preview({ addedBookmarks: 0, newCategories: 0, folderMapping: [] }); m.select(); await flush();
    assert(m.apply.disabled); assert.match(m.summary.textContent, /No new sites/); m.apply.dispatch('click'); await flush(); assert.equal(m.fake.writes.length, 0);
    for (const overrides of [{ addedBookmarks: -1 }, { addedBookmarks: '2' }, { folderMapping: Array(201).fill({ sourcePath: 'x', categoryName: 'x' }) }]) {
        m.fake.value = preview(overrides); m.select(); await flush(); assert(m.panel.hidden); assert(m.apply.disabled);
    }
    m.fake.value = preview({ addedBookmarks: 2000, newCategories: 200, folderMapping: Array.from({ length: 200 }, (_, index) => ({ sourcePath: `Folder ${index}`, categoryName: `Folder ${index}` })) });
    m.select(); await flush(); assert.equal(m.host.querySelectorAll('.bookmark-import-mapping li').length, 200); assert(m.host.querySelectorAll('*').length < 260);
    assert.equal(m.host.querySelector('.bookmark-import-mapping').tabIndex, 0);
});

test('actual parser integration displays hostile labels as text and never mounts HTML, links, icons or bookmark rows', async () => {
    const m = model();
    m.fake.prepare = async text => ({ snapshot: { privacy: { syncEnabled: true, onlineFavicons: true } }, plan: parser.planImport(text, { links: [], categories: [] }, { createCategoryId: ({ index }) => `import_${index}` }) });
    const hostile = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><H3>&lt;img src=https://example.com/tracker&gt;</H3><DL><A HREF="https://example.com" ICON="https://example.com/icon">Secret title</A></DL></DL>';
    m.select(hostile); await flush();
    assert.match(m.host.querySelector('.bookmark-import-mapping li').textContent, /<img src=https:\/\/example.com\/tracker>/);
    assert.equal(m.host.querySelectorAll('img, iframe, script, a').length, 0); assert(!m.host.querySelectorAll('*').some(node => node.textContent?.includes('Secret title')));
    assert.match(m.host.querySelector('.bookmark-import-privacy p').textContent, /Chrome Sync: On · Online site icons: On/);
    assert(!m.apply.disabled);
});

test('English and Chinese follow the displayed catalog then document language; privacy flags are explicit', async () => {
    for (const options of [{ lang: 'zh-CN' }, { lang: 'zh_CN' }, { lang: 'en', i18n: { t: key => key === 'dateFormattingLocale' ? 'zh-CN' : key } }]) {
        const m = model(options); m.select(); await flush(); assert.equal(m.choose.textContent, '选择书签 HTML 文件'); assert.match(m.summary.textContent, /请核对/);
        assert.match(m.host.querySelector('.bookmark-import-privacy p').textContent, /已关闭/);
        m.cancel.dispatch('click'); assert.match(m.status.textContent, /已取消/);
    }
    const m = model({ lang: 'zh-CN', i18n: { t: key => key === 'dateFormattingLocale' ? 'en' : key } });
    m.fake.value.snapshot = {}; m.select(); await flush(); assert.equal(m.choose.textContent, 'Choose bookmark HTML file');
    assert.match(m.host.querySelector('.bookmark-import-privacy p').textContent, /Chrome Sync: Unknown · Online site icons: Unknown/);
});

test('detached or destroyed view cannot prepare stale file reads or start queued applies', async () => {
    for (const action of ['detach', 'destroy']) {
        const m = model(), wait = deferred(); m.select(fixture, { text: () => wait.promise }); await flush();
        if (action === 'detach') m.host.remove(); else m.view.destroy();
        wait.resolve(fixture); await flush(); assert.equal(m.fake.reads.length, 0); assert.equal(m.fake.writes.length, 0); assert.equal(m.view.hasUncommittedWork(), false);
        const n = model(); n.select(); await flush(); n.apply.dispatch('click');
        if (action === 'detach') n.host.remove(); else n.view.destroy();
        await flush(); assert.equal(n.fake.writes.length, 0); assert.equal(n.view.pending, null);
    }
});

test('detached preparation cannot reopen; destroyed in-flight save never reports cancellation or retries', async () => {
    const m = model(), wait = deferred(); m.fake.prepare = async () => { await wait.promise; return preview(); };
    m.select(); await flush(); m.host.remove(); wait.resolve(); await flush(); assert(m.panel.hidden); assert.equal(m.view.hasUncommittedWork(), false);
    const n = model(), saving = deferred(); n.select(); await flush(); n.fake.apply = async () => { n.fake.writes.push(true); await saving.promise; };
    n.apply.dispatch('click'); await flush(); n.view.destroy(); saving.resolve(); await flush(); assert.equal(n.fake.writes.length, 1); assert.equal(n.view.pending, null); assert(!/^Import preview cancelled/.test(n.status.textContent));
});

test('dirty form and known pre-write storage blockers have actionable messages, never an uncertain-save or invalid-file claim', async () => {
    for (const code of ['BOOKMARK_IMPORT_FORM_DIRTY', 'BOOKMARK_IMPORT_INVALID_STATE', 'BOOKMARK_IMPORT_STATE_LIMIT', 'BOOKMARK_IMPORT_UNAVAILABLE', 'LINKS_LOCK_UNAVAILABLE', 'LAYOUT_IDENTITY_INVALID']) {
        for (const stage of ['prepare', 'apply']) {
            const m = model();
            if (stage === 'prepare') m.fake.prepare = async () => { throw failure(code); };
            m.select(); await flush();
            if (stage === 'apply') { m.fake.apply = async () => { throw failure(code); }; m.apply.dispatch('click'); await flush(); }
            assert.match(m.status.textContent, code === 'BOOKMARK_IMPORT_FORM_DIRTY' ? /Save your current settings edits/ : /settings.*safely/);
            assert(!/may have been added|Export bookmarks/.test(m.status.textContent)); assert(m.panel.hidden);
        }
    }
    const m = model(); m.select(); await flush();
    m.fake.apply = async () => { throw Object.assign(failure('UNKNOWN'), { mayHaveCommitted: true }); };
    m.apply.dispatch('click'); await flush(); assert.match(m.status.textContent, /may have been added/);
});

for (const stage of ['read', 'apply', 'failure']) test(`delayed ${stage} preserves newer focus and background-page intent`, async () => {
    const m = model(), wait = deferred(), other = m.document.createElement('input'); m.document.body.append(other);
    if (stage === 'read') m.fake.prepare = async () => { await wait.promise; return preview(); };
    else { m.select(); await flush(); m.fake.apply = async () => { await wait.promise; if (stage === 'failure') throw failure('WRITE'); }; }
    if (stage === 'read') m.select(); else m.apply.dispatch('click');
    await flush(); other.focus(); wait.resolve(); await flush(); assert.equal(m.document.activeElement, other);
    const again = deferred(); m.fake.prepare = async () => { await again.promise; return preview(); }; m.select(); await flush();
    m.document.listeners.get('pointerdown')({ target: m.document.body }); m.document.activeElement = m.document.body;
    again.resolve(); await flush(); assert.equal(m.document.activeElement, m.document.body);
    const hidden = deferred(); m.fake.prepare = async () => { await hidden.promise; return preview(); }; m.select(); await flush();
    m.document.hidden = true; hidden.resolve(); await flush(); assert.notEqual(m.document.activeElement, m.summary);
});

test('accessible labels, repeat suppression, multiple mounts and teardown remain independent', async () => {
    const m = model(); assert(m.file.hidden); assert.equal(m.file.getAttribute('aria-label'), m.choose.textContent); assert.equal(m.status.getAttribute('aria-live'), 'polite');
    assert(m.choose.dispatch('keydown', { key: 'Enter', repeat: true }).prevented); assert(m.choose.dispatch('keydown', { key: ' ', repeat: true }).prevented);
    assert(!m.choose.dispatch('keydown', { key: 'Enter', isComposing: true }).prevented);
    m.select(); await flush(); const headingId = m.panel.getAttribute('aria-labelledby'); assert(m.document.getElementById(headingId));
    const secondHost = m.document.createElement('div'); m.document.body.append(secondHost);
    const second = m.window.LocalItabBookmarkImportView.mount(secondHost, { prepare: async () => preview(), apply: async () => ({ applied: true }) });
    assert.notEqual(secondHost.querySelector('.bookmark-import-preview').getAttribute('aria-labelledby'), headingId);
    m.view.destroy(); assert.equal(m.host.children.length, 0); assert(secondHost.children.length); second.destroy();
});
