'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Controller, PAGE_SIZE } = require('../shared/shortcut-finder');
const id = n => `l_${n.toString(16).padStart(32, '0')}`;
function fixture(links, categories = [{ id: 'dev', name: '开发 Équipe' }]) {
    let snapshot = { links, categories }, fresh = null;
    const opened = [];
    const controller = new Controller({ getSnapshot: () => snapshot, readSnapshot: () => fresh || structuredClone(snapshot), activate: link => opened.push(link) });
    return { controller, opened, snapshot: () => snapshot, replace: next => { snapshot = next; }, fresh: next => { fresh = next; } };
}
const site = (n, extra = {}) => ({ layoutId: id(n), title: 'GitHub Café [docs]', url: 'https://github.com/team?a=1&b=2', category: 'dev', ...extra });

test('all words is opt-in, ANDs across fields of one record, and preserves literal phrase defaults', () => {
    const f = fixture([site(1), site(2, { title: 'Other', url: 'https://example.invalid', category: 'other' })]);
    assert.equal(f.controller.matchMode, 'phrase');
    assert.equal(f.controller.search('GitHub 开发').total, 0);
    for (const query of ['GitHub 开发', '开发 GitHub', 'github.com equipe', 'cafe team 开发', '[docs] a=1&b=2']) {
        const result = f.controller.search(query, 0, '', 'all-words');
        assert.equal(result.total, 1, query); assert.equal(result.rows[0].token.id, id(1));
        assert.equal(result.matchMode, 'all-words');
    }
    assert.equal(f.controller.search('GitHub Other').total, 0, 'terms cannot match separate records');
    assert.equal(f.controller.search('github.com missing').total, 0, 'every term is required');
    assert.equal(f.controller.search('GitHub Café', 0, '', 'phrase').total, 1);
    assert.equal(f.controller.search('Café GitHub').total, 0, 'phrase order is unchanged');
    assert.equal(f.controller.search('GitHub  Café').total, 0, 'phrase whitespace stays literal');
    assert.equal(f.controller.search('GitHub 开发', 0, '', 'unknown').total, 0);
    assert.equal(f.controller.matchMode, 'phrase', 'unknown modes fail back to the established behavior');
    f.controller.search('GitHub 开发', 0, '', 'all-words'); f.controller.clear();
    assert.equal(f.controller.matchMode, 'phrase'); assert.equal(f.controller.query, '');
    assert.equal(f.controller.search('GitHub 开发').total, 0);
});

test('all words splits Unicode whitespace, folds accents and case, preserves Chinese/fullwidth text and treats punctuation literally', () => {
    const f = fixture([site(1, { title: 'GitHub 中文 Café 全角ＡＢＣ，测试 [docs] foo|bar' })]);
    for (const whitespace of [' ', '  ', '\t', '\n', '\r\n', '\u00a0', '\u2009', '\u202f', '\u3000']) {
        assert.equal(f.controller.search(`${whitespace}GITHUB${whitespace}开发${whitespace}`, 0, '', 'all-words').total, 1, JSON.stringify(whitespace));
    }
    for (const query of ['中文 开发', 'CAFE\u0301 ÉQUIPE', 'ＡＢＣ， 开发', '[docs] foo|bar', 'GitHub GitHub 开发 开发', '?a=1&b=2 中文']) {
        assert.equal(f.controller.search(query).total, 1, query);
    }
    for (const query of ['GitHub.* 开发', 'GitHub OR missing', '"GitHub" 开发', '-GitHub 开发', 'ABC， 开发', 'GitHub\u200b开发']) {
        assert.equal(f.controller.search(query).total, 0, `literal, no operators or extra normalization: ${query}`);
    }
    assert.equal(f.controller.search('hub 开发').total, 1, 'terms stay literal substrings, not whole-word or fuzzy matching');
});

test('empty queries, exact category intersection and orphan scope remain explicit in all-words mode', () => {
    const f = fixture([site(1), site(2, { category: 'other' }), site(3, { category: 'orphan' })]);
    assert.equal(f.controller.search('\t\u3000 ', 0, '', 'all-words').total, 0);
    assert.equal(f.controller.search('', 0, 'dev').total, 1);
    assert.equal(f.controller.search('github cafe').total, 1);
    assert.equal(f.controller.search('github 开发', 0, 'other').total, 0);
    assert.equal(f.controller.search('github orphan', 0, 'orphan').total, 1);
    assert.equal(f.controller.search('github', 0, 'deleted').total, 0);
    assert.equal(f.controller.category, 'deleted'); assert.equal(f.controller.matchMode, 'all-words');
    assert.equal(f.controller.search('', 0, 'deleted').total, 0);
});

test('all-words pagination keeps all duplicate identities in source order and creates at most 50 rows', () => {
    const links = Array.from({ length: 127 }, (_, i) => site(i + 1)); const f = fixture(links);
    const before = JSON.stringify(f.snapshot()); const seen = [];
    for (let page = 0; page < 3; page++) {
        const result = f.controller.search('cafe 开发', page, '', 'all-words');
        assert.equal(result.total, 127); assert.equal(result.start, page * PAGE_SIZE);
        assert.equal(result.rows.length, page === 2 ? 27 : 50);
        seen.push(...result.rows.map(row => row.token.id));
    }
    assert.deepEqual(seen, links.map(link => link.layoutId));
    assert.equal(f.controller.search('cafe 开发', 99).page, 2);
    assert.equal(f.controller.search('cafe 开发', -1).page, 0);
    assert.equal(f.controller.search('absent 开发').total, 0);
    assert.equal(f.controller.page, 0); assert.equal(JSON.stringify(f.snapshot()), before);
    assert.equal(f.opened.length, 0);
});

test('all-words results retain fresh-read identity checks for duplicate IDs, edits, deletes, category moves and unsafe URLs', async () => {
    const links = [site(1), site(2)]; const f = fixture(links);
    const token = f.controller.search('github 开发', 0, '', 'all-words').rows[1].token;
    f.replace({ links: structuredClone(links).reverse(), categories: f.snapshot().categories });
    assert.equal(await f.controller.activate(token), 'opened'); assert.equal(f.opened[0].layoutId, id(2));
    for (const freshLinks of [
        [links[0]], [links[0], { ...links[1], url: 'https://changed.invalid' }],
        [links[0], { ...links[1], title: 'Changed' }], [links[0], { ...links[1], category: 'other' }],
        [links[0], links[1], { ...links[1] }], [links[0], { ...links[1], url: 'javascript:alert(1)' }]
    ]) {
        f.fresh({ links: freshLinks }); assert.equal(await f.controller.activate(token), 'stale');
    }
    assert.equal(f.opened.length, 1);
    const legacy = fixture([site(1, { layoutId: undefined }), site(2, { layoutId: undefined })]);
    assert.equal(await legacy.controller.activate(legacy.controller.search('github 开发', 0, '', 'all-words').rows[1].token), 'stale');
    assert.equal(legacy.opened.length, 0);
});

test('changing match mode cancels an owned pending target check before a late read resolves', async () => {
    const links = [site(1)]; let finish, opened = 0, closed = 0;
    const controller = new Controller({ getSnapshot: () => ({ links }), readSnapshot: () => new Promise(resolve => { finish = resolve; }),
        reserve: () => ({ open() { opened++; }, close() { closed++; } }) });
    const result = controller.search('github team', 0, '', 'all-words');
    const request = controller.activate(result.rows[0].token);
    controller.search('github team', 0, '', 'phrase'); finish({ links });
    assert.equal(await request, 'cancelled'); assert.equal(opened, 0); assert.equal(closed, 1);
});

test('all-words search needs no network, permission requests, storage writes or new configuration', () => {
    let disallowed = 0;
    const forbid = () => { disallowed++; throw new Error('Search must stay transient and local'); };
    const context = { URL, window: {}, fetch: forbid, XMLHttpRequest: forbid, localStorage: { setItem: forbid },
        navigator: { clipboard: { readText: forbid } }, chrome: { permissions: { request: forbid }, tabs: { create: forbid },
            storage: { local: { set: forbid }, sync: { set: forbid } } } };
    vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve('../shared/shortcut-finder'), 'utf8'), context);
    const snapshot = { links: [site(1)], categories: [{ id: 'dev', name: '开发' }] }; const before = JSON.stringify(snapshot);
    const controller = new context.window.LocalItabFinder.Controller({ getSnapshot: () => snapshot, reserve: forbid });
    assert.equal(controller.search('github 开发', 0, '', 'all-words').total, 1);
    controller.search('github', 1); controller.search('', 0, 'dev'); controller.clear();
    assert.equal(disallowed, 0); assert.equal(JSON.stringify(snapshot), before);
    const manifest = JSON.parse(fs.readFileSync(require.resolve('../manifest.json'), 'utf8'));
    assert.deepEqual(manifest.permissions, ['storage', 'unlimitedStorage', 'identity', 'contextMenus']);
    assert.deepEqual(manifest.optional_permissions, ['scripting']);
});

const { createDocument } = require('./helpers/finder-dom-model');
function viewFixture({ locale = 'en', count = 2, pending = false } = {}) {
    const document = createDocument(), host = document.createElement('header'); document.body.append(host);
    const messages = JSON.parse(fs.readFileSync(require.resolve(`../_locales/${locale}/messages.json`), 'utf8'));
    let snapshot = { links: Array.from({ length: count }, (_, i) => site(i + 1)), categories: [{ id: 'dev', name: '开发' }] };
    let finish, notify, opened = 0, closed = 0;
    const context = { window: null, document, URL, i18n: { t: key => messages[key]?.message || key } }; context.window = context;
    vm.createContext(context);
    for (const file of ['dialog-focus', 'shortcut-finder', 'shortcut-finder-view']) vm.runInContext(fs.readFileSync(require.resolve(`../shared/${file}`), 'utf8'), context);
    const view = context.LocalItabFinder.mount(host, { getSnapshot: () => snapshot,
        readSnapshot: () => pending ? new Promise(resolve => { finish = resolve; }) : structuredClone(snapshot),
        reserve: () => ({ open() { opened++; }, close() { closed++; } }), subscribe(fn) { notify = fn; return () => {}; } });
    const opener = host.querySelector('button'); opener.focus(); opener.dispatch('click');
    return { document, messages, view, opener, snapshot: () => snapshot, replace: next => { snapshot = next; }, notify: () => notify(),
        finish: () => finish(structuredClone(snapshot)), opened: () => opened, closed: () => closed,
        input: document.querySelector('input'), mode: document.querySelector('.finder-match-mode'), category: document.querySelector('.finder-category'),
        button: key => document.querySelectorAll('button').find(button => button.textContent === messages[key].message),
        rows: () => document.querySelectorAll('.finder-result') };
}

test('match controls and semantic hints are label-associated and localized in English and Chinese', () => {
    for (const locale of ['en', 'zh_CN']) {
        const f = viewFixture({ locale });
        assert.equal(f.mode.tagName, 'SELECT'); assert.equal(f.mode.value, 'phrase');
        assert.equal(f.document.querySelectorAll('label').find(label => label.htmlFor === f.mode.id).textContent, f.messages.finderMatchMode.message);
        assert.deepEqual(f.mode.children.map(option => option.textContent), [f.messages.finderMatchPhrase.message, f.messages.finderMatchAllWords.message]);
        const hint = f.document.getElementById(f.mode.getAttribute('aria-describedby'));
        assert.equal(f.input.getAttribute('aria-describedby'), hint.id); assert.equal(hint.textContent, f.messages.finderMatchPhraseHint.message);
        f.mode.focus(); f.mode.value = 'all-words'; f.mode.dispatch('change');
        assert.equal(hint.textContent, f.messages.finderMatchAllWordsHint.message);
        assert.equal(f.document.activeElement, f.mode);
        assert.equal(f.mode.dispatch('keydown', { key: 'ArrowDown' }).prevented, false, 'native selector keys are not hijacked');
        assert.equal(f.opened(), 0); f.view.destroy();
    }
});

test('UI switches from the old phrase behavior to all words, preserves query/filter on refresh and resets paging and transient mode', () => {
    const f = viewFixture({ count: 127 }); const before = JSON.stringify(f.snapshot());
    f.input.value = 'GitHub 开发'; f.input.dispatch('input'); assert.equal(f.rows().length, 0);
    f.mode.value = 'all-words'; f.mode.dispatch('change'); assert.equal(f.rows().length, 50);
    f.button('finderNext').dispatch('click'); assert.equal(f.document.querySelector('[role="status"]').textContent, 'Results: 127 · Showing: 51–100');
    f.notify(); assert.equal(f.mode.value, 'all-words'); assert.equal(f.input.value, 'GitHub 开发');
    assert.equal(f.document.querySelector('[role="status"]').textContent, 'Results: 127 · Showing: 51–100');
    f.mode.focus(); f.mode.value = 'phrase'; f.mode.dispatch('change'); assert.equal(f.rows().length, 0); assert.equal(f.document.activeElement, f.mode);
    f.mode.value = 'all-words'; f.mode.dispatch('change'); assert.equal(f.document.querySelector('[role="status"]').textContent, 'Results: 127 · Showing: 1–50');
    f.category.value = 'dev'; f.category.dispatch('change'); assert.equal(f.rows().length, 50);
    f.button('finderClear').dispatch('click');
    assert.equal(f.mode.value, 'phrase'); assert.equal(f.category.value, ''); assert.equal(f.input.value, ''); assert.equal(f.rows().length, 0);
    assert.equal(f.document.activeElement, f.input);
    f.mode.value = 'all-words'; f.mode.dispatch('change'); f.view.close(); assert.equal(f.document.activeElement, f.opener);
    f.opener.dispatch('click'); assert.equal(f.document.querySelector('.finder-match-mode').value, 'phrase');
    assert.equal(JSON.stringify(f.snapshot()), before); assert.equal(f.opened(), 0); f.view.destroy();
});

test('mode change, Clear and Close cancel a pending result before its fresh read completes', async () => {
    for (const action of ['mode', 'clear', 'close']) {
        const f = viewFixture({ pending: true });
        f.input.value = 'GitHub 开发'; f.mode.value = 'all-words'; f.mode.dispatch('change');
        f.rows()[1].dispatch('click'); assert.equal(f.view.pending, true); assert.equal(f.document.querySelector('.finder-list').getAttribute('aria-busy'), 'true');
        if (action === 'mode') { f.mode.value = 'phrase'; f.mode.dispatch('change'); }
        else if (action === 'clear') f.button('finderClear').dispatch('click');
        else f.view.close();
        assert.equal(f.view.pending, false); assert.equal(f.closed(), 1);
        f.finish(); await new Promise(setImmediate); assert.equal(f.opened(), 0); assert.equal(f.closed(), 1);
        if (action !== 'close') assert.equal(f.document.querySelector('.finder-list').getAttribute('aria-busy'), 'false');
        f.view.destroy();
    }
});

test('all-words IME editing does not launch, and stale-result refresh keeps selected matching behavior', async () => {
    const f = viewFixture(); f.mode.value = 'all-words'; f.mode.dispatch('change');
    f.input.value = 'GitHub 开发'; f.input.dispatch('input'); assert.equal(f.rows().length, 2);
    f.input.dispatch('compositionstart'); f.input.value = 'GitHub\u3000开发'; f.input.dispatch('input');
    assert.equal(f.rows().length, 2); f.rows()[0].dispatch('click', { detail: 0 }); assert.equal(f.opened(), 0);
    f.input.dispatch('compositionend'); assert.equal(f.rows().length, 2);
    f.input.dispatch('keydown', { key: 'ArrowDown' }); const oldResult = f.rows()[0]; assert.equal(f.document.activeElement, oldResult);
    f.replace({ ...f.snapshot(), links: f.snapshot().links.slice(1) });
    oldResult.dispatch('click'); await new Promise(setImmediate);
    assert.equal(f.opened(), 0); assert.equal(f.rows().length, 1); assert.equal(f.mode.value, 'all-words');
    assert.equal(f.document.activeElement, f.input); assert.equal(f.document.querySelector('.finder-alert').textContent, f.messages.finderChanged.message);
    f.view.destroy();
});
