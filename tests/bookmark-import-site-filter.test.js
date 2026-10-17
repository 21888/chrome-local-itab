const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const parser = require('../shared/bookmark-import');
const source = fs.readFileSync('shared/bookmark-import-view.js', 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const marker = '<!DOCTYPE NETSCAPE-Bookmark-file-1>';
const htmlFor = count => `${marker}<DL>${Array.from({ length: count }, (_, index) => `<A HREF="https://example.com/site/${index}?private=synthetic-${index}#fragment">Site ${index} 私人</A>`).join('')}</DL>`;
const plan = (html, existing = { links: [], categories: [] }) => ({ snapshot: { privacy: { syncEnabled: true, onlineFavicons: false } }, plan: parser.planImport(html, existing, { createCategoryId: ({ index }) => `import_${index}` }) });
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function model({ value = freeze(plan(htmlFor(51))), lang = 'en', i18n } = {}) {
    const document = createDocument({ aggregateTextContent: true, blurUnavailableFocus: true }); document.documentElement.lang = lang;
    const host = document.createElement('form'); document.body.append(host);
    const fake = { value, reads: [], writes: [], network: 0, clipboard: 0,
        async prepare(text) { this.reads.push(text); return this.value; },
        async apply(value) { this.writes.push(value); return { applied: true }; } };
    const forbidden = () => { fake.network++; throw Error('Network and active HTML parsing are forbidden'); };
    const navigator = { clipboard: { writeText() { fake.clipboard++; throw Error('Clipboard is forbidden'); } } };
    const window = { i18n, navigator, fetch: forbidden, Image: forbidden, XMLHttpRequest: forbidden, open: forbidden };
    vm.runInNewContext(source, { window, navigator, fetch: forbidden, Image: forbidden, XMLHttpRequest: forbidden, DOMParser: forbidden });
    const view = window.LocalItabBookmarkImportView.mount(host, { prepare: text => fake.prepare(text), apply: value => fake.apply(value) });
    const query = name => host.querySelector(`.bookmark-import-${name}`), file = query('file');
    const select = (text = htmlFor(51), options = {}) => { file.files = [{ size: Buffer.byteLength(text), text: async () => text, ...options }]; file.dispatch('change'); };
    const click = node => { if (!node.disabled) node.focus(); node.dispatch('click'); };
    return { document, host, fake, view, query, select, click, file, apply: query('apply'), cancel: query('cancel') };
}
function controls(m) { return Object.fromEntries(['toggle', 'region', 'filter', 'clear', 'matches', 'scope', 'empty', 'list', 'range', 'previous', 'next'].map(key => [key, m.query(`sites-${key}`)])); }
const rows = m => m.host.querySelectorAll('.bookmark-import-site');
const titles = m => rows(m).map(row => row.querySelector('.bookmark-import-site-title').textContent);
function search(c, text, event = {}) { c.filter.value = text; c.filter.dispatch('input', event); }

test('site filter: actual view exposes a labelled local filter inside the collapsed review only', async () => {
    const m = model(); m.select(); await flush(); const c = controls(m);
    assert(c.filter, 'The review-list text filter is missing');
    assert.equal(c.filter.type, 'text'); assert(c.region.contains(c.filter)); assert(c.region.hidden); assert(c.filter.disabled); assert(c.clear.disabled);
    assert.equal(c.filter.value, ''); assert.equal(c.list.children.length, 0); assert.equal(c.matches.textContent, '');
    const label = m.host.querySelector(`label[for="${c.filter.id}"]`); assert.equal(label.textContent, 'Filter review list');
    assert.equal(c.filter.getAttribute('aria-describedby'), c.scope.id); assert.equal(c.filter.autocomplete, 'off'); assert.equal(c.filter.spellcheck, false);
    m.click(c.toggle); assert(!c.filter.disabled); assert(!c.clear.disabled); assert.equal(m.document.activeElement, c.toggle);
    assert.equal(c.scope.textContent, 'Only filters this review list; all 51 sites in this import plan will still be added.');
    assert.equal(c.matches.textContent, 'Matches 51 / New sites 51'); assert(c.empty.hidden);
});

for (const count of [0, 1, 50, 51, 2000]) test(`site filter: ${count} additions stay bounded and filtering never changes the full prepared object`, async () => {
    const value = freeze(plan(htmlFor(count))), before = JSON.stringify(value), digest = hash(value), m = model({ value });
    m.select(htmlFor(count)); await flush(); const c = controls(m);
    if (!count) {
        assert(c.toggle.disabled); assert(c.filter.disabled); assert(m.apply.disabled); search(c, 'Site'); c.clear.dispatch('click');
        assert.equal(rows(m).length, 0); assert.equal(c.matches.textContent, '');
        return;
    }
    const summary = m.query('summary').textContent, counts = m.query('counts').textContent, privacy = m.query('privacy').textContent;
    m.click(c.toggle); assert.equal(rows(m).length, Math.min(50, count));
    if (count > 50) { m.click(c.next); assert.equal(c.list.start, 51); }
    search(c, '  SyNtHeTiC-0#FRAGMENT  '); assert.deepEqual(titles(m), ['Site 0 私人']);
    assert.equal(c.filter.value, '  SyNtHeTiC-0#FRAGMENT  '); assert.equal(c.list.start, 1); assert.equal(c.matches.textContent, `Matches 1 / New sites ${count}`);
    search(c, 'no-such-private-title'); assert.equal(rows(m).length, 0); assert(!c.empty.hidden); assert.equal(c.range.textContent, 'Showing 0–0 of 0');
    assert(c.previous.disabled); assert(c.next.disabled); assert(!m.apply.disabled);
    assert.equal(c.toggle.textContent, `Sites to be added (${count})`); assert.equal(m.query('summary').textContent, summary);
    assert.equal(m.query('counts').textContent, counts); assert.equal(m.query('privacy').textContent, privacy);
    assert.equal(JSON.stringify(value), before); assert.equal(hash(value), digest); assert.equal(m.fake.writes.length, 0);
    m.click(m.apply); m.apply.dispatch('click'); await flush();
    assert.equal(m.fake.writes.length, 1); assert.equal(m.fake.writes[0], value); assert.equal(m.fake.writes[0].plan.additions.links.length, count);
    assert.equal(JSON.stringify(value), before); assert.equal(hash(value), digest); assert.equal(c.filter.value, ''); assert.equal(c.matches.textContent, '');
});

test('site filter: literal case-insensitive title, full canonical URL and final suffixed category search excludes skipped bookmarks', async () => {
    const long = 'q'.repeat(3000);
    const html = `${marker}<DL><H3>Research</H3><DL>
        <A HREF="https://EXAMPLE.com:443/a/../report?q=1&amp;x=%26#PART" ICON="https://tracker.invalid/icon">&lt;img src=x&gt; [a.*] Exact</A>
        <A HREF="https://example.com/report?q=1&amp;x=%26#PART">SKIPPED_DUPLICATE</A>
        <A HREF="javascript:alert(1)">SKIPPED_INVALID</A>
        <A HREF="https://saved.example/">SKIPPED_SAVED</A>
        <A HREF="https://例子.测试/路径?secret=一&amp;long=${long}#尾部">中文 🧭</A>
        </DL><H3>Research</H3><DL><A HREF="https://second.example/?q=2">Second</A></DL></DL>`;
    const value = plan(html, { links: [{ url: 'https://saved.example/', category: 'existing' }], categories: [{ id: 'existing', name: 'Research' }] });
    value.plan.preview.skipExamples.push({ title: 'SKIP_EXAMPLE_PRIVATE', url: 'https://private.invalid/?token=sentinel' });
    freeze(value); const digest = hash(value), m = model({ value }); m.select(html); await flush(); const c = controls(m); m.click(c.toggle);
    assert.deepEqual(value.plan.additions.categories.map(row => row.name), ['Research (2)', 'Research (3)']);
    const cases = [
        ['[A.*]', ['<img src=x> [a.*] Exact']], ['a.+', []], ['  research (3)  ', ['Second']], ['RESEARCH (2)', ['<img src=x> [a.*] Exact', '中文 🧭']],
        ['https://example.com/report?q=1&x=%26#part', ['<img src=x> [a.*] Exact']], ['xn--', ['中文 🧭']], ['q'.repeat(2000), ['中文 🧭']],
        ['%e8%b7%af%e5%be%84', ['中文 🧭']], ['中文 🧭', ['中文 🧭']], ['SKIPPED_', []], ['SKIP_EXAMPLE_PRIVATE', []], ['token=sentinel', []]
    ];
    for (const [query, expected] of cases) { search(c, query); assert.deepEqual(titles(m), expected, query); }
    assert.equal(hash(value), digest); assert.equal(m.fake.network, 0); assert.equal(m.fake.clipboard, 0); assert.equal(m.fake.writes.length, 0);
    assert.equal(m.host.querySelectorAll('a, img, iframe, script').length, 0);
    assert(m.host.querySelectorAll('[aria-live]').every(node => !/SKIP|https:|sentinel|中文|img|token=/.test(node.textContent)));
});

test('site filter: matching order and 50-item pages reset on query, clear and collapse without taking focus', async () => {
    const m = model(); m.select(); await flush(); const c = controls(m); m.click(c.toggle);
    search(c, 'SITE'); assert.equal(c.matches.textContent, 'Matches 51 / New sites 51');
    m.click(c.next); assert.deepEqual(titles(m), ['Site 50 私人']); assert.equal(c.range.textContent, 'Showing 51–51 of 51');
    c.filter.focus(); search(c, 'site 1'); assert.equal(m.document.activeElement, c.filter);
    assert.deepEqual(titles(m), ['Site 1 私人', ...Array.from({ length: 10 }, (_, index) => `Site ${index + 10} 私人`)]);
    assert.equal(c.range.textContent, 'Showing 1–11 of 11');
    search(c, '   '); assert.equal(c.filter.value, '   '); assert.equal(rows(m).length, 50); assert.equal(c.list.start, 1);
    m.click(c.next); m.click(c.clear); assert.equal(c.filter.value, ''); assert.equal(c.list.start, 1); assert.equal(rows(m).length, 50); assert.equal(m.document.activeElement, c.clear);
    const other = m.document.createElement('input'); m.document.body.append(other); other.focus();
    search(c, 'site 2'); assert.equal(m.document.activeElement, other); c.clear.dispatch('click'); assert.equal(m.document.activeElement, other);
    m.click(c.next); search(c, 'site 3'); m.click(c.toggle);
    assert.equal(c.filter.value, ''); assert.equal(c.list.children.length, 0); assert.equal(c.matches.textContent, ''); assert.equal(c.range.textContent, ''); assert(c.filter.disabled);
    search(c, 'stale collapsed input'); c.clear.dispatch('click'); assert.equal(c.list.children.length, 0);
    // The synthetic write above is not possible on a hidden disabled native input; reopening still starts unfiltered.
    m.click(c.toggle); assert.equal(c.filter.value, ''); assert.equal(c.list.start, 1); assert.equal(rows(m).length, 50); assert.equal(c.matches.textContent, 'Matches 51 / New sites 51');
});

test('site filter: composition commits once, plain Enter cannot submit, IME defaults and repeated spaces remain editable', async () => {
    const m = model(); m.select(); await flush(); const c = controls(m); m.click(c.toggle); c.filter.focus();
    search(c, 'site 1'); const initial = titles(m);
    c.filter.dispatch('compositionstart'); search(c, '私人', { isComposing: true }); search(c, '私人');
    assert.deepEqual(titles(m), initial); c.clear.dispatch('click', { isComposing: true }); assert.deepEqual(titles(m), initial);
    for (const event of [{ key: 'Enter' }, { key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }]) {
        const result = c.filter.dispatch('keydown', event); assert(!result.prevented); assert(result.stopped);
    }
    assert(!c.filter.dispatch('keydown', { key: ' ', repeat: true }).prevented);
    c.filter.dispatch('compositionend'); assert.equal(rows(m).length, 50); assert.equal(c.matches.textContent, 'Matches 51 / New sites 51');
    for (const event of [{ key: 'Enter' }, { key: 'Enter', repeat: true }]) {
        const result = c.filter.dispatch('keydown', event); assert(result.prevented); assert(result.stopped);
    }
    for (const event of [{ key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }]) assert(!c.filter.dispatch('keydown', event).prevented);
    search(c, '私人  '); assert.equal(c.filter.value, '私人  '); assert.equal(rows(m).length, 50);
    assert(c.clear.dispatch('keydown', { key: 'Enter', repeat: true }).prevented); assert(c.next.dispatch('keydown', { key: ' ', repeat: true }).prevented);
    assert.equal(m.fake.writes.length, 0); const escape = c.filter.dispatch('keydown', { key: 'Escape' }); assert(escape.prevented); assert(escape.stopped);
    assert(m.query('preview').hidden); assert.equal(c.filter.value, ''); assert.equal(c.list.children.length, 0); assert.equal(m.document.activeElement, m.query('choose'));
});

function assertCleared(c) {
    assert.equal(c.filter.value, ''); assert.equal(c.matches.textContent, ''); assert.equal(c.range.textContent, ''); assert.equal(c.list.children.length, 0);
    assert(c.filter.disabled); assert(c.clear.disabled); assert(c.region.hidden); assert.equal(c.toggle.getAttribute('aria-expanded'), 'false');
}
function staleEvents(m, old) {
    const retired = m.document.createElement('div'); m.document.body.append(retired); retired.append(old.toggle, old.region);
    search(old, 'Site'); old.filter.dispatch('compositionstart'); old.filter.dispatch('compositionend'); old.clear.dispatch('click'); old.toggle.dispatch('click'); old.next.dispatch('click'); old.previous.dispatch('click');
    assert.equal(old.list.children.length, 0); assert.equal(old.matches.textContent, ''); assert.equal(old.range.textContent, '');
    const enter = old.filter.dispatch('keydown', { key: 'Enter' }); assert(enter.prevented); assert(enter.stopped);
}
for (const action of ['cancel', 'close', 'destroy']) test(`site filter: ${action} clears private query and reattached old controls cannot affect a fresh plan`, async () => {
    const m = model(); m.select(); await flush(); const old = controls(m); m.click(old.toggle); search(old, 'synthetic-1'); old.filter.dispatch('compositionstart');
    if (action === 'cancel') m.click(m.cancel); else if (action === 'close') m.view.close(); else m.view.destroy();
    assertCleared(old); staleEvents(m, old); assert.equal(m.fake.writes.length, 0); assert.equal(m.view.hasUncommittedWork(), false);
    if (action !== 'destroy') {
        m.fake.value = freeze(plan(htmlFor(1))); m.select(htmlFor(1)); await flush(); const fresh = controls(m); m.click(fresh.toggle);
        old.filter.dispatch('compositionend'); old.clear.dispatch('click'); assert.deepEqual(titles(m), ['Site 0 私人']); assert.equal(fresh.filter.value, '');
    }
});

test('site filter: new file immediately clears query/rows; late reads and prepare success/failure cannot revive an old filter', async () => {
    const m = model(); m.select(); await flush(); const old = controls(m); m.click(old.toggle); search(old, 'synthetic-1');
    const read = deferred(); m.select('late-read', { text: () => read.promise }); assertCleared(old); assert.equal(m.query('sites-filter'), null); await flush();
    m.fake.value = freeze(plan(htmlFor(1))); m.select('new'); await flush(); const fresh = controls(m); read.resolve('late-read'); await flush();
    assert(!m.fake.reads.includes('late-read')); staleEvents(m, old); m.click(fresh.toggle); assert.deepEqual(titles(m), ['Site 0 私人']);
    const rejectedRead = deferred(); m.select('late-read-error', { text: async () => { await rejectedRead.promise; throw Error('PRIVATE FILE ERROR'); } }); await flush();
    m.select('current-after-read-error'); await flush(); const afterReadError = controls(m); m.click(afterReadError.toggle); search(afterReadError, 'none');
    rejectedRead.resolve(); await flush(); assert.equal(controls(m).filter, afterReadError.filter); assert.equal(afterReadError.filter.value, 'none'); assert(!m.host.textContent.includes('PRIVATE FILE ERROR'));
    for (const fail of [false, true]) {
        const gate = deferred(); m.fake.prepare = async text => { if (text === 'late-prepare') { await gate.promise; if (fail) throw Error('PRIVATE FAILURE'); return freeze(plan(htmlFor(50))); } return m.fake.value; };
        search(controls(m), 'synthetic-0'); const former = controls(m); m.select('late-prepare'); assertCleared(former); await flush();
        m.select('latest'); await flush(); const current = controls(m); m.click(current.toggle); search(current, 'none');
        gate.resolve(); await flush(); staleEvents(m, former); assert.equal(controls(m).filter, current.filter); assert.equal(current.filter.value, 'none'); assert.equal(current.matches.textContent, 'Matches 0 / New sites 1');
        assert(!m.host.textContent.includes('PRIVATE FAILURE'));
    }
});

for (const outcome of ['success', 'CONFLICT', 'BOOKMARK_IMPORT_UNVERIFIED']) test(`site filter: ${outcome} freezes pending-save controls, clears completion and never retries`, async () => {
    const m = model(), gate = deferred(); m.select(); await flush(); const c = controls(m); m.click(c.toggle); search(c, 'synthetic-0');
    m.fake.apply = async value => { m.fake.writes.push(value); await gate.promise; if (outcome !== 'success') throw Object.assign(Error('PRIVATE SAVE ERROR'), { code: outcome }); return { applied: true }; };
    m.click(m.apply); await flush(); const before = titles(m), matches = c.matches.textContent;
    assert(c.filter.disabled); assert(c.clear.disabled); assert(c.previous.disabled); assert(c.next.disabled);
    search(c, 'new query while disabled'); c.filter.dispatch('compositionend'); c.clear.dispatch('click'); c.next.dispatch('click'); c.toggle.dispatch('click');
    assert.deepEqual(titles(m), before); assert.equal(c.matches.textContent, matches); m.apply.dispatch('click'); assert.equal(m.view.close(), false);
    gate.resolve(); await flush(); assertCleared(c); staleEvents(m, c); m.apply.dispatch('click'); await flush();
    assert.equal(m.fake.writes.length, 1); assert.equal(m.fake.writes[0], m.fake.value); assert(m.query('preview').hidden); assert(!m.host.textContent.includes('PRIVATE SAVE ERROR'));
});

test('site filter: detached host and destroyed pending save cannot update or retain private filtered rows', async () => {
    const m = model(), gate = deferred(); m.select(); await flush(); const c = controls(m); m.click(c.toggle); search(c, 'synthetic-0');
    m.host.remove(); search(c, 'none'); c.clear.dispatch('click'); assert.deepEqual(titles(m), ['Site 0 私人']); m.view.destroy(); assertCleared(c);
    const n = model(); n.select(); await flush(); const d = controls(n); n.click(d.toggle); search(d, 'synthetic-0');
    n.fake.apply = async value => { n.fake.writes.push(value); await gate.promise; return { applied: true }; };
    n.click(n.apply); await flush(); n.view.destroy(); assertCleared(d); staleEvents(n, d); gate.resolve(); await flush(); assert.equal(n.fake.writes.length, 1); assert.equal(n.view.pending, null);
});

test('site filter: both catalogs and fallback text describe full-plan apply and numbers without leaking search content to live regions', async () => {
    const en = JSON.parse(fs.readFileSync('_locales/en/messages.json', 'utf8')), zh = JSON.parse(fs.readFileSync('_locales/zh_CN/messages.json', 'utf8'));
    for (const key of ['SitesFilter', 'SitesClear', 'SitesScope', 'SitesMatches', 'SitesEmpty']) {
        assert(en[`bookmarkImport${key}`]?.message); assert(zh[`bookmarkImport${key}`]?.message);
    }
    for (const [lang, catalog, chinese] of [['en', en, false], ['zh-CN', zh, true], ['en', zh, true], ['zh_CN', null, true], ['es-ES', null, false]]) {
        const i18n = catalog ? { t: key => key === 'dateFormattingLocale' ? (chinese ? 'zh-CN' : 'en') : catalog[key]?.message || key } : { t: key => key };
        const m = model({ lang, i18n }); m.select(); await flush(); const c = controls(m); m.click(c.toggle); search(c, 'PRIVATE_QUERY_SENTINEL');
        assert.equal(c.clear.textContent, chinese ? '清空筛选' : 'Clear filter');
        assert.equal(c.matches.textContent, chinese ? '匹配 0 / 本次新增 51' : 'Matches 0 / New sites 51');
        assert.equal(c.empty.textContent, chinese ? '没有匹配的网站。' : 'No sites match this filter.');
        assert.equal(c.scope.textContent, chinese ? '仅筛选核对清单；仍会添加本次计划全部 51 个网站。' : 'Only filters this review list; all 51 sites in this import plan will still be added.');
        assert(m.host.querySelectorAll('[aria-live]').every(node => !/PRIVATE_QUERY_SENTINEL|https:|私人/.test(node.textContent)));
        assert.equal(c.region.getAttribute('aria-live'), undefined); assert.equal(c.list.getAttribute('aria-live'), undefined); assert(!m.apply.disabled);
    }
});
