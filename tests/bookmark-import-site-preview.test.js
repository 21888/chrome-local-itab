const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const parser = require('../shared/bookmark-import');
const source = fs.readFileSync('shared/bookmark-import-view.js', 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

test('added sites: a default-collapsed explicit review entry is present without rendering private rows', async () => {
    const document = createDocument({ aggregateTextContent: true, blurUnavailableFocus: true });
    document.documentElement.lang = 'en';
    const host = document.createElement('div'); document.body.append(host);
    const window = {};
    vm.runInNewContext(source, { window });
    const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><A HREF="https://example.com/?private=secret">Secret title</A></DL>';
    const value = { snapshot: { privacy: { syncEnabled: false, onlineFavicons: false } }, plan: parser.planImport(html, { links: [], categories: [] }, { createCategoryId: ({ index }) => `import_${index}` }) };
    window.LocalItabBookmarkImportView.mount(host, { prepare: async () => value, apply: async () => ({ applied: true }) });
    const file = host.querySelector('input'); file.files = [{ size: Buffer.byteLength(html), text: async () => html }]; file.dispatch('change'); await flush();
    const toggle = host.querySelector('.bookmark-import-sites-toggle');
    assert(toggle, 'The explicit added-sites review entry is missing');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(toggle.textContent, 'Sites to be added (1)');
    assert.equal(host.querySelectorAll('.bookmark-import-site').length, 0);
    assert(!host.textContent.includes('Secret title'));
    assert(!host.textContent.includes('private=secret'));
});

const { deferred } = require('./helpers/task-dom-model');
const marker = '<!DOCTYPE NETSCAPE-Bookmark-file-1>';
const generatedHTML = count => `${marker}<DL>${Array.from({ length: count }, (_, index) => `<A HREF="https://example.com/site/${index}?private=synthetic-${index}#fragment">Site ${index} 私人</A>`).join('')}</DL>`;
const plan = (html, existing = { links: [], categories: [] }) => ({ snapshot: { privacy: { syncEnabled: true, onlineFavicons: false } }, plan: parser.planImport(html, existing, { createCategoryId: ({ index }) => `import_${index}` }) });
function deepFreeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
    return value;
}
function model({ lang = 'en', i18n, value = plan(generatedHTML(51)) } = {}) {
    const document = createDocument({ aggregateTextContent: true, blurUnavailableFocus: true }); document.documentElement.lang = lang;
    const host = document.createElement('div'); document.body.append(host);
    const fake = { value, reads: [], writes: [], network: 0, clipboard: 0,
        async prepare(text) { this.reads.push(text); return this.value; },
        async apply(value) { this.writes.push(value); return { applied: true }; } };
    const forbidden = () => { fake.network++; throw Error('No network or active HTML parsing is allowed'); };
    const navigator = { clipboard: { writeText() { fake.clipboard++; throw Error('No clipboard actions are allowed'); } } };
    const window = { i18n, fetch: forbidden, navigator, Image: forbidden, XMLHttpRequest: forbidden };
    vm.runInNewContext(source, { window, navigator, fetch: forbidden, DOMParser: forbidden, XMLHttpRequest: forbidden, Image: forbidden });
    const view = window.LocalItabBookmarkImportView.mount(host, { prepare: text => fake.prepare(text), apply: value => fake.apply(value) });
    const query = name => host.querySelector(`.bookmark-import-${name}`);
    const choose = query('choose'), apply = query('apply'), cancel = query('cancel'), file = host.querySelector('input');
    function select(text = generatedHTML(51), options = {}) { choose.focus(); file.files = [{ size: Buffer.byteLength(text), text: async () => text, ...options }]; file.dispatch('change'); }
    function click(node) { if (!node.disabled) node.focus(); node.dispatch('click'); }
    return { host, document, fake, view, choose, apply, cancel, file, query, select, click };
}
function siteControls(m) {
    return Object.fromEntries(['toggle', 'region', 'list', 'previous', 'next', 'range'].map(name => [name, m.query(`sites-${name}`)]));
}
function visibleSites(m) {
    return m.host.querySelectorAll('.bookmark-import-site').map(row => ({
        title: row.querySelector('.bookmark-import-site-title').textContent,
        url: row.querySelector('.bookmark-import-site-url').textContent,
        category: row.querySelector('.bookmark-import-site-category').textContent
    }));
}
function expectedSites(value, start, end, label = 'Category') {
    const names = new Map(value.plan.additions.categories.map(category => [category.id, category.name]));
    return value.plan.additions.links.slice(start, end).map(link => ({ title: link.title, url: link.url, category: `${label}: ${names.get(link.category)}` }));
}

for (const count of [0, 1, 50, 51, 2000]) test(`added sites: actual planner ${count} additions render only the requested page and can return from the last page`, async () => {
    const value = deepFreeze(plan(generatedHTML(count))), original = JSON.stringify(value), m = model({ value });
    m.select(generatedHTML(count)); await flush(); const c = siteControls(m);
    assert.equal(c.toggle.textContent, `Sites to be added (${count})`);
    assert.equal(c.toggle.getAttribute('aria-expanded'), 'false'); assert(c.region.hidden);
    assert.equal(visibleSites(m).length, 0); assert(!m.host.textContent.includes('private=synthetic'));
    const summary = m.query('summary').textContent, counts = m.query('counts').textContent, privacy = m.query('privacy').textContent;
    if (!count) {
        assert(c.toggle.disabled); assert(m.apply.disabled); c.toggle.dispatch('click'); assert.equal(visibleSites(m).length, 0); assert.equal(c.range.textContent, '');
    } else {
        m.click(c.toggle); assert.equal(c.toggle.getAttribute('aria-expanded'), 'true'); assert(!c.region.hidden);
        const pages = Math.ceil(count / 50);
        for (let page = 0; page < pages; page++) {
            const start = page * 50, end = Math.min(start + 50, count);
            assert.deepEqual(visibleSites(m), expectedSites(value, start, end));
            assert.equal(c.list.start, start + 1); assert.equal(c.range.textContent, `Showing ${start + 1}–${end} of ${count}`);
            assert.equal(c.previous.disabled, page === 0); assert.equal(c.next.disabled, page === pages - 1);
            assert(m.host.querySelectorAll('.bookmark-import-site').length <= 50);
            if (page < pages - 1) m.click(c.next);
        }
        for (let page = pages - 1; page > 0; page--) m.click(c.previous);
        assert.deepEqual(visibleSites(m), expectedSites(value, 0, Math.min(count, 50)));
        m.click(c.toggle); assert(c.region.hidden); assert.equal(c.list.children.length, 0); assert.equal(c.range.textContent, '');
        m.click(c.toggle); assert.deepEqual(visibleSites(m), expectedSites(value, 0, Math.min(count, 50)));
    }
    assert.equal(m.query('summary').textContent, summary); assert.equal(m.query('counts').textContent, counts); assert.equal(m.query('privacy').textContent, privacy);
    assert.equal(JSON.stringify(value), original); assert.equal(m.fake.writes.length, 0); assert.equal(m.fake.network, 0); assert.equal(m.fake.clipboard, 0);
    assert.equal(m.host.querySelectorAll('a, img, iframe, script').length, 0);
    assert.equal(c.list.getAttribute('aria-live'), undefined); assert.equal(c.region.getAttribute('aria-live'), undefined);
    assert.equal(c.range.getAttribute('aria-live'), 'polite'); assert(!c.range.textContent.includes('https://'));
});

test('added sites: hostile titles, full canonical URLs, query distinctions, Unicode and suffixed category names match the actual save plan', async () => {
    const longURL = `https://long.example/path?synthetic=${'q'.repeat(3500)}&amp;next=保留#片段`;
    const html = `${marker}<DL><H3>Research</H3><DL>
        <A HREF="https://EXAMPLE.com:443/a/../report?q=1&amp;x=%26#part" ICON="https://tracker.invalid/icon">&lt;img src=x onerror=alert(1)&gt;</A>
        <A HREF="https://example.com/report?q=1&amp;x=%26#part">SKIPPED_DUPLICATE_TITLE</A>
        <A HREF="javascript:alert(1)">SKIPPED_INVALID_TITLE</A>
        <A HREF="https://saved.example/">SKIPPED_SAVED_TITLE</A>
        <A HREF="https://例子.测试/路径?q=一&amp;other=二#片段">Unicode 🧭 中文</A>
        <A HREF="${longURL}">Long URL, intact</A>
        <A HREF="https://example.com/report?q=2&amp;x=%26#part">Query remains significant</A>
        </DL><H3>Research</H3><DL><A HREF="https://second.example/">Same folder name</A></DL></DL>`;
    const value = plan(html, { links: [{ url: 'https://saved.example/', category: 'existing' }], categories: [{ id: 'existing', name: 'Research' }] });
    value.plan.preview.skipExamples.push({ title: 'SKIP_EXAMPLE_PRIVATE', url: 'https://private.invalid/?token=skip-sentinel' });
    deepFreeze(value); const m = model({ value }); m.select(html); await flush();
    assert.equal(value.plan.preview.addedBookmarks, 5); assert.equal(value.plan.preview.skippedBookmarks, 3);
    assert.deepEqual(value.plan.additions.categories.map(category => category.name), ['Research (2)', 'Research (3)']);
    assert(!m.host.textContent.includes('<img src=x')); assert(!m.host.textContent.includes('q=1'));
    m.click(siteControls(m).toggle);
    assert.deepEqual(visibleSites(m), expectedSites(value, 0, 5));
    assert.equal(visibleSites(m)[0].url, 'https://example.com/report?q=1&x=%26#part');
    assert.equal(visibleSites(m)[0].title, '<img src=x onerror=alert(1)>');
    assert(visibleSites(m)[2].url.length > 3500); assert(visibleSites(m)[1].url.includes('xn--'));
    assert(!m.host.textContent.includes('SKIPPED_')); assert(!m.host.textContent.includes('SKIP_EXAMPLE_PRIVATE')); assert(!m.host.textContent.includes('skip-sentinel'));
    assert.equal(m.host.querySelectorAll('a, img, iframe, script').length, 0); assert.equal(m.fake.network, 0); assert.equal(m.fake.clipboard, 0);
    const live = m.host.querySelectorAll('[aria-live]'); assert(live.every(node => !node.textContent.includes('https://') && !node.textContent.includes('<img')));
});

test('added sites: expand, page, collapse and re-open preserve prepared identity and all values for a single explicit apply', async () => {
    const value = deepFreeze(plan(generatedHTML(51))), expected = JSON.stringify(value), m = model({ value }); m.select(); await flush();
    const c = siteControls(m); m.click(c.toggle); m.click(c.next); m.click(c.toggle); m.click(c.toggle); m.click(c.next);
    assert.equal(m.fake.writes.length, 0); assert.equal(JSON.stringify(value), expected);
    m.click(m.apply); m.apply.dispatch('click'); await flush();
    assert.equal(m.fake.writes.length, 1); assert.equal(m.fake.writes[0], value); assert.equal(JSON.stringify(m.fake.writes[0]), expected);
    assert.equal(m.host.querySelectorAll('.bookmark-import-site').length, 0); assert.equal(c.list.children.length, 0); assert.equal(c.range.textContent, '');
    assert(m.query('preview').hidden); c.toggle.dispatch('click'); c.next.dispatch('click'); assert.equal(c.list.children.length, 0);
});

for (const action of ['cancel', 'escape', 'close', 'destroy']) test(`added sites: ${action} clears rows and detached controls cannot revive a cleared generation`, async () => {
    const m = model(); m.select(); await flush(); const c = siteControls(m); m.click(c.toggle); m.click(c.next);
    if (action === 'cancel') m.click(m.cancel);
    if (action === 'escape') c.previous.dispatch('keydown', { key: 'Escape' });
    if (action === 'close') assert.equal(m.view.close(), true);
    if (action === 'destroy') m.view.destroy();
    assert.equal(c.list.children.length, 0); assert.equal(c.range.textContent, ''); assert.equal(c.toggle.getAttribute('aria-expanded'), 'false'); assert(c.region.hidden);
    assert(c.toggle.disabled); assert(c.previous.disabled); assert(c.next.disabled);
    assert.equal(m.view.hasUncommittedWork(), false); assert.equal(m.fake.writes.length, 0);
    // Even reattaching retained old DOM nodes cannot grant them a new generation.
    const retired = m.document.createElement('div'); m.document.body.append(retired); retired.append(c.toggle, c.region);
    c.toggle.dispatch('click'); c.next.dispatch('click'); c.previous.dispatch('click');
    assert.equal(c.list.children.length, 0); assert(c.region.hidden);
    if (action !== 'destroy') {
        assert.equal(m.document.activeElement, m.choose);
        m.select(); await flush(); const fresh = siteControls(m); assert.notEqual(fresh.toggle, c.toggle); assert.equal(fresh.list.children.length, 0);
        m.click(fresh.toggle); assert.equal(fresh.range.textContent, 'Showing 1–50 of 51'); c.next.dispatch('click'); assert.equal(fresh.range.textContent, 'Showing 1–50 of 51');
    }
});

test('added sites: reselection clears old rows immediately, and late file reads/preparations/errors cannot expose stale rows', async () => {
    const m = model(); m.select(); await flush(); const old = siteControls(m); m.click(old.toggle); m.click(old.next);
    const read = deferred(); m.select('old text', { text: () => read.promise }); assert.equal(old.list.children.length, 0); assert.equal(m.query('sites-toggle'), null);
    const newest = plan(generatedHTML(1)); m.fake.value = newest; m.select('new text'); await flush();
    read.resolve('old text'); await flush(); assert.deepEqual(m.fake.reads, [generatedHTML(51), 'new text']);
    const fresh = siteControls(m); old.toggle.dispatch('click'); old.next.dispatch('click'); assert.equal(fresh.list.children.length, 0);
    m.click(fresh.toggle); assert.deepEqual(visibleSites(m), expectedSites(newest, 0, 1));
    for (const fail of [false, true]) {
        const gate = deferred(); m.fake.prepare = async text => { if (text === 'late') { await gate.promise; if (fail) throw Error('Private late error'); return plan(generatedHTML(50)); } return newest; };
        m.select('late'); await flush(); m.select('current'); await flush(); const current = siteControls(m);
        gate.resolve(); await flush(); assert.equal(siteControls(m).toggle, current.toggle); assert.equal(current.list.children.length, 0);
        m.click(current.toggle); assert.deepEqual(visibleSites(m), expectedSites(newest, 0, 1));
    }
});

test('added sites: known and uncertain save failures clear rows without retries or private error text', async () => {
    for (const code of ['CONFLICT', 'BOOKMARK_IMPORT_PRIVACY_CHANGED', 'WRITE', 'BOOKMARK_IMPORT_UNVERIFIED']) {
        const m = model(); m.select(); await flush(); const c = siteControls(m); m.click(c.toggle); m.click(c.next);
        m.fake.apply = async value => { m.fake.writes.push(value); throw Object.assign(Error('SENSITIVE_ERROR_CONTENT'), { code }); };
        m.click(m.apply); await flush(); assert(m.query('preview').hidden); assert.equal(c.list.children.length, 0); assert.equal(c.range.textContent, '');
        assert(!m.host.textContent.includes('SENSITIVE_ERROR_CONTENT')); assert(!m.host.textContent.includes('private=synthetic'));
        assert.match(m.query('status').textContent, /CONFLICT|CHANGED/.test(code) ? /fresh preview/ : /may have been added/);
        c.toggle.dispatch('click'); c.next.dispatch('click'); m.apply.dispatch('click'); await flush(); assert.equal(m.fake.writes.length, 1); assert.equal(c.list.children.length, 0);
    }
});

test('added sites: applying freezes read-only controls, blocks new operations and clears expanded rows on completion', async () => {
    const m = model(), wait = deferred(); m.select(); await flush(); const c = siteControls(m); m.click(c.toggle);
    m.fake.apply = async value => { m.fake.writes.push(value); await wait.promise; return { applied: true }; };
    m.click(m.apply); await flush(); const rows = visibleSites(m), range = c.range.textContent;
    assert(c.toggle.disabled); assert(c.previous.disabled); assert(c.next.disabled);
    c.toggle.dispatch('click'); c.next.dispatch('click'); c.previous.dispatch('click'); m.select('ignored'); m.apply.dispatch('click'); m.cancel.dispatch('click'); c.toggle.dispatch('keydown', { key: 'Escape' });
    assert.equal(m.view.close(), false); assert.deepEqual(visibleSites(m), rows); assert.equal(c.range.textContent, range); assert.equal(m.fake.reads.length, 1); assert.equal(m.fake.writes.length, 1);
    wait.resolve(); await flush(); assert.equal(c.list.children.length, 0); assert.equal(m.fake.writes.length, 1);
});

test('added sites: destroyed in-flight apply clears retained nodes and never writes or reports twice', async () => {
    const m = model(), wait = deferred(); m.select(); await flush(); const c = siteControls(m); m.click(c.toggle);
    m.fake.apply = async value => { m.fake.writes.push(value); await wait.promise; return { applied: true }; };
    m.click(m.apply); await flush(); m.view.destroy(); assert.equal(c.list.children.length, 0); assert.equal(c.range.textContent, '');
    c.toggle.dispatch('click'); c.next.dispatch('click'); wait.resolve(); await flush(); assert.equal(m.fake.writes.length, 1); assert.equal(m.view.pending, null); assert.equal(m.host.children.length, 0);
});

test('added sites: page-boundary focus remains on a useful control and never steals a newer input focus', async () => {
    const m = model(); m.select(); await flush(); const c = siteControls(m); m.click(c.toggle);
    assert.equal(m.document.activeElement, c.toggle); m.click(c.next); assert(c.next.disabled); assert.equal(m.document.activeElement, c.previous);
    m.click(c.previous); assert(c.previous.disabled); assert.equal(m.document.activeElement, c.next);
    const other = m.document.createElement('input'); m.document.body.append(other); other.focus();
    c.next.dispatch('click'); assert.equal(m.document.activeElement, other); c.previous.dispatch('click'); assert.equal(m.document.activeElement, other);
    m.click(c.toggle); m.click(c.toggle); assert.equal(m.document.activeElement, c.toggle);
    assert.equal(c.toggle.getAttribute('aria-controls'), c.region.id); assert.equal(c.region.getAttribute('aria-labelledby'), c.toggle.id);
    assert.match(m.document.getElementById(c.toggle.getAttribute('aria-describedby')).textContent, /private parameters/);
    assert.equal(c.list.tabIndex, 0);
});

test('added sites: detached controls and composition/repeated key input cannot start a read-only operation', async () => {
    const m = model(); m.select(); await flush(); const c = siteControls(m);
    c.toggle.dispatch('click', { isComposing: true }); assert.equal(c.list.children.length, 0);
    assert(c.toggle.dispatch('keydown', { key: 'Enter', repeat: true }).prevented); assert(c.toggle.dispatch('keydown', { key: ' ', repeat: true }).prevented);
    m.click(c.toggle); const rows = visibleSites(m); c.next.dispatch('click', { isComposing: true }); assert.deepEqual(visibleSites(m), rows);
    m.host.remove(); c.next.dispatch('click'); c.toggle.dispatch('click'); assert.equal(c.range.textContent, 'Showing 1–50 of 51');
    m.view.destroy(); assert.equal(c.list.children.length, 0);
});

test('added sites: invalid addition shapes/counts/categories fail closed before mounting rows or enabling apply', async () => {
    const mutations = [
        value => { delete value.plan.additions; },
        value => { value.plan.additions.links = null; },
        value => { value.plan.preview.addedBookmarks++; },
        value => { value.plan.preview.newCategories++; },
        value => { value.plan.additions.links[0].category = 'not_in_plan'; },
        value => { value.plan.additions.links[0].title = { private: true }; },
        value => { value.plan.additions.links[0].url = null; },
        value => { value.plan.additions.categories[0].name = null; },
        value => { value.plan.additions.categories.push(value.plan.additions.categories[0]); value.plan.preview.newCategories++; },
        value => { value.plan.additions.links.push(...Array(2000).fill(value.plan.additions.links[0])); value.plan.preview.addedBookmarks = 2001; }
    ];
    for (const mutate of mutations) {
        const value = plan(generatedHTML(1)); mutate(value); const m = model({ value }); m.select(); await flush();
        assert(m.query('preview').hidden); assert(m.apply.disabled); assert.equal(m.query('sites-toggle'), null); assert.equal(visibleSites(m).length, 0); assert.equal(m.fake.writes.length, 0);
    }
});

test('added sites: English/Chinese catalogs and missing-catalog fallback localize controls, ranges, warning and category labels', async () => {
    const en = JSON.parse(fs.readFileSync('_locales/en/messages.json', 'utf8')), zh = JSON.parse(fs.readFileSync('_locales/zh_CN/messages.json', 'utf8'));
    const keys = ['Sites', 'SitesPrivacy', 'SitesRange', 'SitesPrevious', 'SitesNext', 'SiteCategory'];
    for (const key of keys) { assert(en[`bookmarkImport${key}`]?.message); assert(zh[`bookmarkImport${key}`]?.message); }
    for (const [lang, catalog, expectedChinese] of [['en', en, false], ['zh-CN', zh, true], ['zh-CN', null, true], ['es-ES', null, false], ['en', zh, true]]) {
        const i18n = catalog ? { t: key => key === 'dateFormattingLocale' ? (expectedChinese ? 'zh-CN' : 'en') : catalog[key]?.message || key } : { t: key => key };
        const m = model({ lang, i18n }); m.select(); await flush(); const c = siteControls(m);
        assert.equal(c.toggle.textContent, expectedChinese ? '将新增的网站（51）' : 'Sites to be added (51)');
        assert.match(m.document.getElementById(c.toggle.getAttribute('aria-describedby')).textContent, expectedChinese ? /私人参数/ : /private parameters/);
        m.click(c.toggle); m.click(c.next); assert.equal(c.range.textContent, expectedChinese ? '第 51–51 条 / 共 51 条' : 'Showing 51–51 of 51');
        assert.equal(c.previous.textContent, expectedChinese ? '上一页（50 条）' : 'Previous 50'); assert.equal(c.next.textContent, expectedChinese ? '下一页（50 条）' : 'Next 50');
        assert.deepEqual(visibleSites(m), expectedSites(m.fake.value, 50, 51, expectedChinese ? '目标分类' : 'Category'));
    }
});
