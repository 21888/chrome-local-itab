'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const api = require('../shared/bookmark-import.js');
const M = '<!DOCTYPE NETSCAPE-Bookmark-file-1>';
const wrap = body => `${M}<DL><p>${body}</DL><p>`;
const a = (url = 'https://example.com/', title = 'Title') => `<DT><A HREF="${url}">${title}</A>`;
const folder = (title, body) => `<DT><H3>${title}</H3><DL><p>${body}</DL><p>`;
const empty = () => ({ links: [], categories: [] });
const opts = { createCategoryId: ({ index }) => `import_${index}` };
const plan = (html, existing = empty(), options = opts) => api.planImport(html, existing, options);
const code = (fn, expected) => assert.throws(fn, error => error.code === expected);
function freeze(object) { Object.freeze(object); for (const value of Object.values(object)) if (value && typeof value === 'object') freeze(value); return object; }

for (const [browser, count] of [['chrome', 3], ['firefox', 3], ['edge', 2]]) {
    test(`${browser} complete export-shaped fixture`, () => {
        const html = fs.readFileSync(path.join(__dirname, 'fixtures/bookmarks', `${browser}.html`), 'utf8');
        const result = plan(html);
        assert.equal(result.preview.addedBookmarks, count);
        assert.equal(result.preview.skippedBookmarks, 0);
        for (const link of result.additions.links) { assert.equal(link.icon, '🔗'); assert.ok(!('layoutId' in link)); }
        assert.ok(result.additions.categories.every(c => c.name !== 'Other favorites'));
        if (browser === 'chrome') {
            assert.equal(result.additions.links[0].url, 'https://example.com/?a=1&b=2#top');
            assert.equal(result.additions.links[1].title, 'Unicode 🌍');
            assert.equal(result.preview.folderMapping[1].sourcePath, 'Bookmarks bar'); // root mapping first
        }
    });
}

test('quoted greater-than, optional DT/P, case, unquoted attrs and Unicode', () => {
    const p = plan(`${M.toLowerCase()}<dl><h3>İstanbul &#x1f30d;</h3><dl><a href=https://example.com/?q=1> A <b>bold</b> &amp; &#233; </a><a href='https://two.example/?q=&gt;' title="a > b">Two</a></dl></dl>`);
    assert.deepEqual(p.additions.links.map(x => x.title), ['A bold & é', 'Two']);
    assert.equal(p.additions.categories[0].name, 'İstanbul 🌍');
    assert.equal(p.additions.links[1].url, 'https://two.example/?q=%3E');
});

test('comments, raw text, images and resource attrs remain inert', () => {
    const hidden = '<A HREF="https://hidden.example/">Hidden</A>';
    const html = wrap(`<base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example/"><!-- ${hidden} --><script>const x = '${hidden}';</script><style>${hidden}</style><iframe src=https://evil.example/>${hidden}</iframe><textarea>${hidden}</textarea><xmp>${hidden}</xmp>${a('https://good.example/', 'İ<img src="https://evil.example/a" onerror="run()"> visible')}`);
    const result = plan(html);
    assert.equal(result.preview.encounteredBookmarks, 1);
    assert.equal(result.additions.links[0].title, 'İ visible');
});

test('raw closing search preserves indexes after Unicode lower-case expansion', () => {
    const result = plan(wrap(`İ<script>${a('https://hidden.example/')}</SCRIPT>${a()}`));
    assert.equal(result.preview.addedBookmarks, 1);
    assert.equal(result.additions.links[0].url, 'https://example.com/');
});

test('raw closing prefix is not a closing tag', () => {
    const p = plan(wrap(`<script></scripted>${a('https://hidden.example/')}</script>${a()}`));
    assert.equal(p.preview.encounteredBookmarks, 1);
});

test('entity decoding is single-pass, numeric, bounded and inert', () => {
    const result = plan(wrap(a('https://good.example/?a=1&amp;b=2', '&lt;img src=x&gt; &amp;lt; &#x1F642; &unknown;')));
    assert.equal(result.additions.links[0].title, '<img src=x> &lt; 🙂 &unknown;');
    code(() => plan(`${M}<!ENTITY x SYSTEM "https://evil.example"><DL></DL>`), 'UNSUPPORTED_DECLARATION');
    const invalid = plan(wrap(a('https://good.example/&#0;', 'A') + a('https://good.example/', '&#xD800;')));
    assert.equal(invalid.preview.skippedBookmarks, 2);
});

test('strict URL acceptance and canonicalization', () => {
    const rejected = ['//example.com', '/local', 'example.com', 'javascript:alert(1)', 'data:text/html,x', 'file:///a', 'chrome://settings', 'https:///example.com', 'https://', 'https://?x', 'https://@example.com', 'https://user@example.com', 'https://user:pass@example.com', 'https://example.com:wrong/', 'https://exa mple.com/', 'https://example.com/\tfoo', 'https://example.com/\\foo', 'https://example.com/%xy', 'https://example.com/%', 'https://example.com/\u0085'];
    for (const raw of rejected) assert.equal(api.canonicalURL(raw), null, raw);
    assert.equal(api.canonicalURL('HTTPS://EXAMPLE.COM:443/a/../b?q=1#f'), 'https://example.com/b?q=1#f');
    assert.equal(api.canonicalURL('https://例え.テスト/資料'), 'https://xn--r8jz45g.xn--zckzah/%E8%B3%87%E6%96%99');
    assert.equal(api.canonicalURL('http://[::1]:8080/a'), 'http://[::1]:8080/a');
});

test('invalid records skip with bounded reason examples', () => {
    const result = plan(wrap('<A>No href</A><A HREF="https://a/" href="https://b/">Duplicate attr</A>' + a('javascript:alert(1)') + a('https://empty.example/', '') + a('https://ctrl.example/', 'bad&#1;') + a()));
    assert.equal(result.preview.encounteredBookmarks, 6);
    assert.equal(result.preview.addedBookmarks, 1);
    assert.deepEqual({ ...result.preview.skippedReasons }, { invalid_url: 2, duplicate_href_attribute: 1, invalid_title: 2 });
    const many = plan(wrap(a('javascript:no').repeat(100)));
    assert.equal(many.preview.skipExamples.length, 50);
    assert.equal(many.preview.omittedSkipExamples, 50);
    assert.ok(many.preview.skipExamples.every(x => Object.keys(x).join(',') === 'reason,bookmarkIndex'));
});

test('additive result does not modify or clone existing objects into additions', () => {
    const existing = freeze({ links: [{ title: 'Keep', url: 'HTTPS://EXAMPLE.COM:443/', category: 'old', layoutId: 'l_123', icon: 'custom' }], categories: [{ id: 'old', name: 'Work', icon: 'icon' }], layout: { positions: { preserve: { x: 1 } } } });
    const before = JSON.stringify(existing);
    const result = plan(wrap(a() + folder('Work', a('https://new.example/'))), existing);
    assert.equal(JSON.stringify(existing), before);
    assert.equal(result.preview.skippedReasons.duplicate_url, 1);
    assert.equal(result.additions.categories[0].name, 'Work (2)');
    assert.equal(result.additions.links.length, 1);
    assert.ok(!('layout' in result));
});

test('canonical dedupe existing and within-file is first-wins; query/fragment preserved', () => {
    const result = plan(wrap(folder('One', a('https://example.com:443/a/../b', 'First')) + folder('Two', a('https://EXAMPLE.COM/b', 'Second')) + a('https://example.com/b?x=1', 'Query') + a('https://example.com/b#f', 'Fragment')));
    assert.deepEqual(result.additions.links.map(l => l.title), ['First', 'Query', 'Fragment']);
    assert.equal(result.preview.skippedReasons.duplicate_url, 1);
    assert.deepEqual(result.additions.categories.map(c => c.name), ['Imported bookmarks', 'One']);
});

test('canonical dedupe includes long existing URLs that normalize shorter', () => {
    const existing = { categories: [], links: [{ url: 'https://example.com/' + 'a/../'.repeat(1000) }] };
    const result = plan(wrap(a()), existing);
    assert.equal(result.preview.addedBookmarks, 0);
    assert.equal(result.preview.skippedReasons.duplicate_url, 1);
});

test('same-name source nodes remain distinct, paths retained, only direct nonempty categories', () => {
    const result = plan(wrap(folder('Same', a('https://one.example/')) + folder('Same', a('https://two.example/')) + folder('Parent', folder('Child', a('https://three.example/'))) + folder('Empty', '') + a('https://root.example/')), empty(), { ...opts, rootLabel: '已导入书签' });
    assert.deepEqual(result.additions.categories.map(c => c.name), ['已导入书签', 'Same', 'Same (2)', 'Parent / Child']);
    assert.notEqual(result.additions.links[0].category, result.additions.links[1].category);
    assert.equal(result.preview.folderMapping[3].sourcePath, 'Parent / Child');
});

test('IDs require explicit factory and reject collisions without retry', () => {
    code(() => plan(wrap(a()), empty(), {}), 'ID_FACTORY_REQUIRED');
    for (const id of ['all', '', 'bad space', 'x'.repeat(129), null]) code(() => plan(wrap(a()), empty(), { createCategoryId: () => id }), 'ID_COLLISION_OR_INVALID');
    let calls = 0;
    code(() => plan(wrap(folder('A', a('https://a.example/')) + folder('B', a('https://b.example/'))), empty(), { createCategoryId: () => { calls++; return 'same'; } }), 'ID_COLLISION_OR_INVALID');
    assert.equal(calls, 2);
    code(() => plan(wrap(a()), { links: [{ url: 'https://existing.example/', category: 'orphan' }], categories: [] }, { createCategoryId: () => 'orphan' }), 'ID_COLLISION_OR_INVALID');
});

test('malformed structural/token forms reject the entire batch', () => {
    const cases = [
        ['<DL></DL>', 'MISSING_MARKER'],
        [`<!-- ${M} --><DL></DL>`, 'MISSING_MARKER'],
        [`${M}<DL>${a()}<A HREF="x>oops</A></DL>`, 'UNTERMINATED_TAG'],
        [`${M}<DL>${a()}<!--`, 'UNTERMINATED_COMMENT'],
        [`${M}<DL>${a()}<A HREF="https://x/"HREF=y>Bad</A></DL>`, 'MALFORMED_ATTRIBUTE'],
        [`${M}<DL><A HREF="https://x/">A<A HREF="https://y/">B</A></A></DL>`, 'INVALID_STRUCTURE'],
        [`${M}<DL><H3>Folder</H3></DL>`, 'UNBALANCED_LIST'],
        [`${M}<DL><DL></DL></DL>`, 'LIST_WITHOUT_FOLDER'],
        [`${M}<DL></DL><DL></DL>`, 'INVALID_STRUCTURE'],
        [`${M}<DL><A HREF="https://x/">Unclosed</DL>`, 'UNBALANCED_LIST'],
        [`${M}<DL><A HREF="https://x/"/></DL>`, 'SELF_CLOSING_STRUCTURE'],
        [`${M}<DL><script>unfinished</DL>`, 'UNTERMINATED_RAW_TEXT'],
        [`${M}<DL><template>${a()}</template></DL>`, 'UNSUPPORTED_CONTAINER'],
        [`${M}<DL><A HREF=x\`y>Bad</A></DL>`, 'MALFORMED_ATTRIBUTE'],
        [`${M}<DL`, 'UNTERMINATED_TAG'],
        [`${M}<DL><H3></H3><DL></DL></DL>`, 'INVALID_FOLDER_TITLE']
    ];
    for (const [html, reason] of cases) code(() => plan(html), reason);
});

test('empty valid export makes no additions or ID calls', () => {
    const result = plan(wrap(folder('Empty', '')), empty(), { createCategoryId: () => { throw Error('unexpected'); } });
    assert.deepEqual(result.additions, { links: [], categories: [] });
});

test('resource limits reject whole batch, including invalid and duplicate records', () => {
    code(() => plan(wrap(a('javascript:no').repeat(10001))), 'BOOKMARK_LIMIT');
    assert.equal(api.parse(wrap(a('javascript:no').repeat(10000))).encountered, 10000);
    code(() => plan(wrap(Array.from({ length: 2001 }, (_, i) => a(`https://example.com/${i}`)).join(''))), 'ADDITION_LIMIT');
    assert.equal(plan(wrap(Array.from({ length: 2000 }, (_, i) => a(`https://example.com/${i}`)).join(''))).preview.addedBookmarks, 2000);
    code(() => plan(wrap(Array.from({ length: 201 }, (_, i) => folder(`F${i}`, a(`https://example.com/${i}`))).join(''))), 'CATEGORY_LIMIT');
    assert.equal(plan(wrap(Array.from({ length: 200 }, (_, i) => folder(`F${i}`, a(`https://example.com/${i}`))).join(''))).preview.newCategories, 200);
    code(() => plan(wrap(folder('x', '').repeat(10001))), 'FOLDER_LIMIT');
    code(() => plan(wrap(a('https://example.com/', '🌍'.repeat(257)))), 'TITLE_LIMIT');
    assert.equal(plan(wrap(a('https://example.com/', '🌍'.repeat(256)))).additions.links[0].title.length, 512);
    code(() => plan(wrap(folder('x'.repeat(254), folder('y', a())))), 'PATH_LIMIT');
    code(() => plan(wrap(a('https://example.com/' + 'a'.repeat(4096)))), 'URL_LIMIT');
    code(() => plan(wrap(a('https://example.com/' + 'é'.repeat(1000)))), 'URL_LIMIT');
    code(() => plan(wrap(a('https://x.test/' + '😀'.repeat(2050)))), 'URL_LIMIT');
});

test('depth 16 allowed; 17 rejected even for empty branches', () => {
    const nest = depth => { let body = a(); for (let i = 0; i < depth; i++) body = folder('F', body); return wrap(body); };
    assert.equal(plan(nest(16)).preview.addedBookmarks, 1);
    code(() => plan(nest(17)), 'DEPTH_LIMIT');
});

test('UTF-8 input bounds, unpaired surrogates, and marker checks', () => {
    code(() => api.parse('x'.repeat(api.LIMITS.inputBytes + 1)), 'INPUT_LIMIT');
    code(() => api.parse('🌍'.repeat(Math.floor(api.LIMITS.inputBytes / 4) + 1)), 'INPUT_LIMIT');
    code(() => api.parse(wrap('\ud800')), 'INVALID_UNICODE');
    const overhead = Buffer.byteLength(wrap('<!-- -->'));
    const full = wrap('<!--' + 'x'.repeat(api.LIMITS.inputBytes - overhead + 1) + '-->');
    assert.equal(Buffer.byteLength(full), api.LIMITS.inputBytes);
    assert.equal(api.parse(full).inputBytes, api.LIMITS.inputBytes);
    code(() => api.parse(full + 'x'), 'INPUT_LIMIT');
    assert.equal(plan('\ufeff \n' + wrap(a())).preview.addedBookmarks, 1);
});

test('runtime performs zero IO and works with dangerous globals denied', () => {
    const sandbox = { module: { exports: {} }, URL };
    for (const name of ['document', 'DOMParser', 'fetch', 'XMLHttpRequest', 'Image', 'chrome', 'localStorage', 'navigator', 'require', 'eval', 'Function', 'setTimeout']) Object.defineProperty(sandbox, name, { get() { throw Error(`I/O access: ${name}`); } });
    vm.createContext(sandbox);
    const source = fs.readFileSync(path.join(__dirname, '../shared/bookmark-import.js'), 'utf8');
    vm.runInContext(source, sandbox, { timeout: 1000 });
    const html = fs.readFileSync(path.join(__dirname, 'fixtures/bookmarks/chrome.html'), 'utf8');
    const result = sandbox.module.exports.planImport(html, empty(), opts);
    assert.equal(result.preview.addedBookmarks, 3);
    assert.ok(!/\b(?:DOMParser|innerHTML|iframe\s*=|eval\s*\(|fetch\s*\(|require\s*\()/.test(source));
});

test('bounded large adversarial scans finish without regex backtracking', () => {
    const started = performance.now();
    const hugeAttr = 'x'.repeat(5 * 1024 * 1024);
    assert.equal(plan(wrap(`<A HREF="https://example.com/" ICON="${hugeAttr}">One</A>`)).preview.addedBookmarks, 1);
    code(() => plan(wrap('<A HREF="' + hugeAttr)), 'UNTERMINATED_TAG');
    const entities = '&'.repeat(1024 * 1024);
    code(() => plan(wrap(a('https://example.com/', entities))), 'TITLE_LIMIT');
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 10000, `Bounded scans took ${elapsed.toFixed(0)} ms`);
});


test('10 MiB uppercase comment and script have bounded peak memory', () => {
    // Isolate peak RSS from other tests; the module itself still performs zero I/O.
    const { execFileSync } = require('node:child_process');
    const modulePath = path.resolve(__dirname, '../shared/bookmark-import.js');
    const script = `
        const api = require(${JSON.stringify(modulePath)});
        const head = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL>';
        for (const [open, close] of [['<!--', '-->'], ['<SCRIPT>', '</SCRIPT>']]) {
            const padding = api.LIMITS.inputBytes - head.length - open.length - close.length - 5;
            const result = api.parse(head + open + 'A'.repeat(padding) + close + '</DL>');
            if (result.inputBytes !== api.LIMITS.inputBytes || result.encountered !== 0) throw Error('Bad result');
        }
        process.stdout.write(JSON.stringify({ peakMiB: process.resourceUsage().maxRSS / 1024 }));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['-e', script], { timeout: 10000, encoding: 'utf8' }));
    assert.ok(result.peakMiB < 256, `Uppercase scan peak RSS: ${result.peakMiB.toFixed(1)} MiB`);
});
