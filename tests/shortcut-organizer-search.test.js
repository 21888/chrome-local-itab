const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const tick = () => new Promise(setImmediate);
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(size = 8) {
    const links = [
        { title: 'Alpha [draft]*?', url: 'https://duplicate.example/path?q=1', category: 'work-hidden-id', extra: 'not-searchable' },
        { title: 'Alpha [draft]*?', url: 'https://duplicate.example/path?q=1', category: 'work-hidden-id', extra: 'second-twin' },
        { title: '中文资料 Ｆｕｌｌ Cafe\u0301 🚀', url: 'https://orphan.example/资料', category: 'orphan-分类' },
        { title: '<b>Beta</b> home', url: 'https://home.example/beta', category: 'home' },
        { title: 'Already there', url: 'https://later.example/', category: 'later' },
        { title: 'Separate title', url: 'https://separate.example/', category: 'home' },
        { title: 'Alpha second group occurrence', url: 'https://alpha.example/', category: 'work-hidden-id' },
        { title: 'Spaced  words\nwith\tlines', url: 'https://space.example/', category: 'orphan-分类' }
    ].slice(0, size);
    while (links.length < size) {
        const index = links.length;
        links.push({ title: `Synthetic site ${String(index).padStart(5, '0')}`, url: `https://site-${index}.example/`, category: index % 2 ? 'home' : 'work-hidden-id' });
    }
    const categories = [{ id: 'work-hidden-id', name: 'Work Projects' }, { id: 'home', name: '家庭资料' }, { id: 'later', name: 'Later' }];
    return { links, categories, state: { links: clone(links), categories: clone(categories), layout: { positions: {} }, unknown: { kept: true } } };
}
function model({ size = 8, locale } = {}) {
    const document = createDocument({ blurUnavailableFocus: true });
    const host = document.createElement('header'); document.body.append(host);
    const snapshot = fixture(size), original = clone(snapshot);
    let reads = 0, writes = 0, networks = 0, savedRequest, pendingRead, pendingWrite;
    const messages = locale && JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const component = { layoutController: { async flush() {} }, async moveReviewedShortcuts(request) { writes++; savedRequest = request; if (pendingWrite) await pendingWrite.promise; } };
    const context = { document, URL, console, window: null,
        i18n: messages && { t: key => messages[key]?.message || key },
        fetch() { networks++; throw new Error('Unexpected network call'); },
        storageManager: { async readShortcutOrganizerSnapshot() { reads++; return pendingRead ? pendingRead.promise : snapshot; } },
        LocalItabContentLifecycle: { departing: false }
    };
    context.window = context; vm.createContext(context);
    for (const file of ['shared/dialog-focus.js', 'shared/shortcut-organizer.js', 'shared/shortcut-organizer-view.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    const view = context.LocalItabOrganizer.mount(host, component);
    const byText = text => document.querySelectorAll('button').find(node => node.textContent === text);
    const search = () => document.querySelector('.organizer-search-input');
    const checks = () => document.querySelectorAll('input').filter(node => node.type === 'checkbox');
    const visible = () => document.querySelectorAll('.organizer-row strong').map(node => Number(node.textContent.split('.')[0]) - 1);
    const selected = () => checks().filter(node => node.checked).map(node => Number(node.parentElement.querySelector('strong').textContent.split('.')[0]) - 1);
    return { document, context, component, view, snapshot, original, byText, search, checks, visible, selected,
        get reads() { return reads; }, get writes() { return writes; }, get networks() { return networks; }, get savedRequest() { return savedRequest; },
        set pendingRead(value) { pendingRead = value; }, set pendingWrite(value) { pendingWrite = value; },
        click(text, fields = {}) { byText(text).dispatch('click', { detail: 1, ...fields }); },
        query(value, fields = {}) { const input = search(); input.value = value; input.dispatch('input', fields); },
        target(value) { const select = document.querySelector('select'); select.value = value; select.dispatch('change'); },
        check(index, checked = true) { const node = checks().find(node => Number(node.parentElement.querySelector('strong').textContent.split('.')[0]) - 1 === index); assert(node, `Visible checkbox for index ${index}`); node.checked = checked; node.dispatch('change'); return node; },
        count() { return document.querySelector('.organizer-count').textContent; }
    };
}

test('search matches literal title, URL and source display name while keeping original grouped order and duplicate identities', async () => {
    const h = model(); await h.view.open();
    assert.deepEqual(h.visible(), [0, 1, 6, 2, 7, 3, 5, 4]);
    for (const [query, expected] of [
        ['[draft]*?', [0, 1]], ['DUPLICATE.EXAMPLE/path?q=1', [0, 1]], ['work projects', [0, 1, 6]],
        ['家庭资料', [3, 5]], ['orphan-分类', [2, 7]], ['work-hidden-id', []], ['not-searchable', []],
        ['title https', []], ['[draft].*', []], ['orphan.example', [2]]
    ]) { h.query(query); assert.deepEqual(h.visible(), expected, query); }
    h.query('   '); assert.deepEqual(h.visible(), [0, 1, 6, 2, 7, 3, 5, 4]);
    assert.deepEqual(h.snapshot, h.original); assert.equal(h.reads, 1); assert.equal(h.writes, 0); assert.equal(h.networks, 0);
});

test('Unicode NFKC, case and whitespace folding are display-only; query never becomes regex or markup', async () => {
    const h = model(); await h.view.open();
    for (const query of ['ｆｕｌｌ CAFÉ', '中文资料', '🚀', 'Cafe\u0301']) { h.query(query); assert.deepEqual(h.visible(), [2]); }
    h.query(' spaced\nwords with  lines '); assert.deepEqual(h.visible(), [7]);
    h.query('<b>'); assert.deepEqual(h.visible(), [3]); assert.equal(h.document.querySelectorAll('b').length, 0);
    assert.equal(h.document.querySelector('.organizer-row strong').textContent, '4. <b>Beta</b> home');
    h.query('.*'); assert.deepEqual(h.visible(), []); assert.deepEqual(h.snapshot, h.original);
});

test('cross-filter selections and destination survive Review, Back and Clear; review includes hidden original indices', async () => {
    const h = model(); await h.view.open(); h.target('later'); h.query('[draft]*?'); h.check(1);
    h.query('orphan.example'); h.check(2);
    assert.equal(h.count(), 'Matching sites: 1 / 8 · Selected sites: 2 · Hidden selected sites: 1');
    h.query('no-match'); assert.deepEqual(h.visible(), []); assert.match(h.count(), /Selected sites: 2 · Hidden selected sites: 2$/); assert.equal(h.byText('Review move').disabled, false);
    h.click('Review move'); assert.deepEqual(h.document.querySelectorAll('li strong').map(node => node.textContent), ['2. Alpha [draft]*?', '3. 中文资料 Ｆｕｌｌ Cafe\u0301 🚀']);
    h.click('Back'); assert.equal(h.search().value, 'no-match'); assert.equal(h.document.querySelector('select').value, 'later'); assert.equal(h.document.activeElement, h.search());
    h.click('Clear search'); assert.equal(h.search().value, ''); assert.equal(h.document.querySelector('select').value, 'later'); assert.deepEqual(h.selected(), [1, 2]); assert.equal(h.document.activeElement, h.search());
    h.click('Review move'); h.click('Move reviewed sites'); await tick();
    assert.deepEqual(Array.from(h.savedRequest.indices), [1, 2]); assert.equal(h.savedRequest.destination, 'later'); assert.deepEqual(clone(h.savedRequest.baseline), h.original.state); assert.equal(h.writes, 1);
});

test('destination switch drops its newly invalid hidden selections without discarding other selections or query', async () => {
    const h = model(); await h.view.open(); h.target('later'); h.check(0); h.check(2); h.query('orphan.example');
    const select = h.document.querySelector('select'); select.focus(); h.target('work-hidden-id');
    assert.equal(h.document.activeElement, select); assert.equal(h.search().value, 'orphan.example'); assert.equal(h.count(), 'Matching sites: 1 / 8 · Selected sites: 1 · Hidden selected sites: 0');
    h.click('Clear search'); assert.deepEqual(h.selected(), [2]);
    const unavailable = h.checks().filter(node => node.disabled); assert.equal(unavailable.length, 3);
    unavailable[0].checked = true; unavailable[0].dispatch('change'); h.click('Review move');
    assert.equal(h.document.querySelectorAll('li').length, 1); assert.equal(h.document.querySelector('li strong').textContent, '3. 中文资料 Ｆｕｌｌ Cafe\u0301 🚀');
});

test('empty library and nonempty unmatched library have distinct localized states and accessible counts', async () => {
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        const empty = model({ size: 0, locale }); await empty.view.open();
        assert.equal(empty.document.querySelector('.organizer-list p').textContent, messages.organizerEmpty.message);
        const h = model({ locale }); await h.view.open(); h.query('missing-literal');
        assert.equal(h.document.querySelector('.organizer-list p').textContent, messages.organizerNoMatches.message);
        assert.equal(h.search().getAttribute('aria-label'), messages.organizerSearch.message);
        assert.equal(h.search().placeholder, messages.organizerSearchPlaceholder.message);
        assert.match(h.count(), /0 \/ 8/); assert.equal(h.document.querySelector('.organizer-count').getAttribute('aria-live'), 'polite');
        assert.equal(h.byText(messages.organizerReview.message).disabled, true); h.click(messages.organizerClearSearch.message); assert.equal(h.visible().length, 8);
        assert.equal(h.writes, 0);
    }
});

test('typing updates the list without replacing, refocusing or altering the selection range of the search input', async () => {
    const h = model(); await h.view.open(); const search = h.search(); search.focus();
    for (const query of ['a', 'al', 'alp', 'alpha', 'Alpha [draft]*?']) {
        search.selectionStart = 1; search.selectionEnd = 2; h.query(query);
        assert.equal(h.search(), search); assert.equal(h.document.activeElement, search); assert.equal(search.selectionStart, 1); assert.equal(search.selectionEnd, 2);
    }
    h.click('Clear search'); assert.equal(h.search(), search); assert.equal(h.document.activeElement, search);
    assert.equal(h.byText('Clear search').disabled, true); assert.equal(h.reads, 1); assert.equal(h.writes, 0);
});

test('IME keeps the composing field and list stable, ignores review/clear, and commits on compositionend without duplicate rebuild', async () => {
    const h = model(); await h.view.open(); h.target('later'); h.check(1); h.query('Alpha');
    const search = h.search(); search.focus(); const oldRow = h.checks()[0]; search.dispatch('compositionstart'); h.query('中文', { isComposing: false });
    assert.deepEqual(h.visible(), [0, 1, 6]); assert.equal(h.search(), search);
    const escape = search.dispatch('keydown', { key: 'Escape' }); assert.equal(escape.stopped, true); assert.equal(escape.prevented, false); assert.equal(h.view.hasUncommittedWork(), true);
    h.click('Clear search'); h.click('Review move'); assert.equal(h.search(), search); assert.equal(h.document.querySelectorAll('li').length, 0);
    search.dispatch('compositionend'); assert.deepEqual(h.visible(), [2]); assert.equal(h.document.activeElement, search); assert.equal(oldRow.isConnected, false);
    const committedRow = h.checks()[0]; search.dispatch('input'); assert.equal(h.checks()[0], committedRow);
    assert.match(h.count(), /Selected sites: 1 · Hidden selected sites: 1$/);
});

test('IME keyCode 229 is ignored until a committed input and blur releases an interrupted composition', async () => {
    const h = model(); await h.view.open(); const search = h.search(); search.focus();
    h.query('中文', { keyCode: 229 }); assert.equal(h.visible().length, 8); search.dispatch('input'); assert.deepEqual(h.visible(), [2]);
    search.dispatch('compositionstart'); h.query('Alpha'); assert.deepEqual(h.visible(), [2]); search.dispatch('focusout'); assert.deepEqual(h.visible(), [0, 1, 6]);
    h.click('Clear search'); assert.equal(h.visible().length, 8); assert.equal(h.writes, 0);
});

test('replaced checkboxes and stale controls cannot change selection, review or a reopened dialog', async () => {
    const h = model(); await h.view.open(); h.target('later'); const staleCheck = h.checks()[0]; h.check(1); h.query('orphan.example');
    staleCheck.checked = true; staleCheck.dispatch('change'); assert.match(h.count(), /Selected sites: 1 · Hidden selected sites: 1$/);
    const search = h.search(), target = h.document.querySelector('select'), clear = h.byText('Clear search'), review = h.byText('Review move'), cancel = h.byText('Cancel');
    h.click('Review move'); search.value = 'Alpha'; search.dispatch('input'); target.value = 'work-hidden-id'; target.dispatch('change'); clear.dispatch('click'); review.dispatch('click');
    assert.equal(h.document.querySelectorAll('li').length, 1); h.click('Back'); assert.equal(h.search().value, 'orphan.example'); assert.equal(h.document.querySelector('select').value, 'later');
    search.value = 'changed'; search.dispatch('compositionend'); clear.dispatch('click'); assert.equal(h.search().value, 'orphan.example');
    h.click('Cancel'); await h.view.open(); h.query('中文');
    for (const node of [clear, review, cancel]) node.dispatch('click'); target.dispatch('change'); staleCheck.dispatch('change'); search.dispatch('input');
    assert.equal(h.search().value, '中文'); assert.equal(h.document.querySelector('select').value, ''); assert.match(h.count(), /Selected sites: 0 · Hidden selected sites: 0$/); assert.equal(h.writes, 0);
});

test('pending reviewed save blocks stale selection/search controls and preserves the exact reviewed request', async () => {
    const h = model(); await h.view.open(); h.target('later'); h.check(1); h.query('orphan.example');
    const stale = { search: h.search(), select: h.document.querySelector('select'), check: h.checks()[0], clear: h.byText('Clear search'), review: h.byText('Review move') };
    h.click('Review move'); const back = h.byText('Back'); const pending = deferred(); h.pendingWrite = pending; h.click('Move reviewed sites');
    stale.search.value = 'Alpha'; stale.search.dispatch('input'); stale.search.dispatch('compositionend'); stale.select.value = 'work-hidden-id'; stale.select.dispatch('change'); stale.check.checked = true; stale.check.dispatch('change');
    stale.clear.dispatch('click'); stale.review.dispatch('click'); back.dispatch('click');
    assert.equal(h.view.pending, true); assert.equal(h.view.close(), false); assert.deepEqual(Array.from(h.savedRequest.indices), [1]); assert.equal(h.savedRequest.destination, 'later'); assert.equal(h.writes, 1);
    assert.equal(h.document.activeElement, h.document.querySelector('.organizer-panel')); pending.resolve(); await tick(); assert.equal(h.view.hasUncommittedWork(), false);
});

test('cancel and Escape write nothing, restore opener focus, and reopening resets only temporary state', async () => {
    const h = model(); const opener = h.byText('Organize saved sites'); opener.focus(); await h.view.open(); h.target('later'); h.check(1); h.query('中文');
    h.search().focus(); h.search().dispatch('keydown', { key: 'Escape' }); assert.equal(h.view.hasUncommittedWork(), false); assert.equal(h.document.activeElement, opener); assert.equal(h.writes, 0);
    await h.view.open(); assert.equal(h.search().value, ''); assert.equal(h.document.querySelector('select').value, ''); assert.deepEqual(h.selected(), []);
    h.target('later'); h.check(2); h.query('missing'); h.click('Review move'); h.click('Cancel');
    assert.equal(h.writes, 0); assert.equal(h.networks, 0); assert.deepEqual(h.snapshot, h.original);
});

test('a canceled delayed read cannot replace a newer search session', async () => {
    const h = model(), read = deferred(); h.pendingRead = read; const opening = h.view.open(); await tick(); h.click('Cancel');
    h.pendingRead = null; await h.view.open(); h.target('later'); h.query('中文'); h.check(2);
    read.resolve(fixture(0)); await opening;
    assert.equal(h.search().value, '中文'); assert.deepEqual(h.visible(), [2]); assert.deepEqual(h.selected(), [2]); assert.equal(h.document.querySelector('select').value, 'later'); assert.equal(h.writes, 0);
});

test('departing lifecycle fences search, target and selection mutations in the current view', async () => {
    const h = model(); await h.view.open(); h.target('later'); h.check(1); h.query('Alpha'); const before = h.count();
    h.context.LocalItabContentLifecycle.departing = true; h.query('中文'); h.target('work-hidden-id'); h.check(0); h.click('Review move'); h.click('Clear search');
    assert.equal(h.count(), before); assert.deepEqual(h.visible(), [0, 1, 6]); assert.equal(h.document.querySelectorAll('li').length, 0); assert.equal(h.writes, 0);
});

test('large synthetic lists preserve every occurrence, order and selected identity through filtering and clearing', async () => {
    const h = model({ size: 5000 }); await h.view.open(); const originalOrder = h.visible(); assert.equal(originalOrder.length, 5000);
    h.target('later'); h.query('Synthetic site 04998'); assert.deepEqual(h.visible(), [4998]); h.check(4998);
    h.query('Synthetic site 04999'); assert.deepEqual(h.visible(), [4999]); h.check(4999); assert.match(h.count(), /Selected sites: 2 · Hidden selected sites: 1$/);
    h.query('not-found'); assert.deepEqual(h.visible(), []); h.click('Clear search'); assert.deepEqual(h.visible(), originalOrder); assert.deepEqual(h.selected(), [4998, 4999]);
    h.click('Review move'); assert.equal(h.document.querySelectorAll('li').length, 2); h.click('Cancel');
    assert.equal(h.reads, 1); assert.equal(h.writes, 0); assert.equal(h.networks, 0); assert.deepEqual(h.snapshot, h.original);
});

test('current-match actions select only eligible visible occurrences and clear them without losing hidden selections', async () => {
    const h = model(); await h.view.open(); h.target('later'); h.check(2); h.query('[draft]*?');
    const selectMatches = h.byText('Select current matches (2)');
    assert(selectMatches, 'Offer the two currently matching, unselected saved occurrences');
    assert.equal(selectMatches.type, 'button'); assert.equal(selectMatches.disabled, false);
    assert.equal(h.byText('Deselect current matches (0)').disabled, true);
    h.click('Select current matches (2)');
    assert.deepEqual(h.selected(), [0, 1]);
    assert.equal(h.count(), 'Matching sites: 2 / 8 · Selected sites: 3 · Hidden selected sites: 1');
    assert.equal(h.byText('Select current matches (0)').disabled, true);
    h.click('Deselect current matches (2)');
    assert.deepEqual(h.selected(), []); assert.match(h.count(), /Selected sites: 1 · Hidden selected sites: 1$/);
    assert.equal(h.byText('Deselect current matches (0)').disabled, true);
    h.click('Review move'); assert.deepEqual(h.document.querySelectorAll('li strong').map(node => node.textContent), ['3. 中文资料 Ｆｕｌｌ Cafe\u0301 🚀']);
    assert.equal(h.reads, 1); assert.equal(h.writes, 0); assert.equal(h.networks, 0); assert.deepEqual(h.snapshot, h.original);
});

test('current-match counts follow individual changes and destination changes, including hidden newly ineligible records', async () => {
    const h = model(); await h.view.open(); h.target('later');
    assert.equal(h.byText('Select current matches (7)').disabled, false);
    h.click('Select current matches (7)'); assert.deepEqual(h.selected(), [0, 1, 6, 2, 7, 3, 5]);
    assert.equal(h.checks().find(node => node.disabled).checked, false);
    h.query('[draft]*?'); h.check(0, false);
    assert.equal(h.byText('Select current matches (1)').disabled, false); assert.equal(h.byText('Deselect current matches (1)').disabled, false);
    h.click('Select current matches (1)'); h.query('orphan.example'); h.target('work-hidden-id');
    assert.equal(h.search().value, 'orphan.example'); assert.match(h.count(), /Selected sites: 4 · Hidden selected sites: 3$/);
    h.click('Deselect current matches (1)'); assert.match(h.count(), /Selected sites: 3 · Hidden selected sites: 3$/);
    h.click('Clear search'); assert.deepEqual(h.selected(), [7, 3, 5]);
    assert.equal(h.byText('Select current matches (2)').disabled, false);
    h.click('Select current matches (2)'); assert.deepEqual(h.selected(), [2, 7, 3, 5, 4]);
    assert.equal(h.byText('Select current matches (0)').disabled, true);
    h.click('Review move'); assert.deepEqual(h.document.querySelectorAll('li strong').map(node => Number(node.textContent.split('.')[0]) - 1), [2, 3, 4, 5, 7]);
    assert.equal(h.writes, 0); assert.deepEqual(h.snapshot, h.original);
});

test('current-match selection without a destination follows individual checkbox semantics and has no twenty-record cap', async () => {
    const h = model({ size: 24 }); await h.view.open(); const order = h.visible();
    h.click('Select current matches (24)'); assert.deepEqual(h.selected(), order); assert.equal(h.byText('Review move').disabled, true);
    h.click('Select current matches (0)'); assert.equal(h.selected().length, 24);
    h.target('later'); assert.equal(h.selected().length, 23); assert.equal(h.checks().find(node => node.disabled).checked, false);
    assert.equal(h.byText('Deselect current matches (23)').disabled, false);
    h.click('Review move'); assert.equal(h.document.querySelectorAll('li').length, 23); h.click('Back');
    assert.equal(h.document.querySelector('select').value, 'later'); assert.deepEqual(h.visible(), order);
    h.click('Deselect current matches (23)'); h.click('Deselect current matches (0)');
    assert.deepEqual(h.selected(), []); assert.equal(h.byText('Select current matches (23)').disabled, false);
    assert.equal(h.reads, 1); assert.equal(h.writes, 0); assert.equal(h.networks, 0); assert.deepEqual(h.snapshot, h.original);
});

test('current-match empty and unmatched actions show localized zero counts, native disabled states and live selection feedback', async () => {
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        const select = n => `${messages.organizerSelectMatches.message} (${n})`, deselect = n => `${messages.organizerDeselectMatches.message} (${n})`;
        const empty = model({ size: 0, locale }); await empty.view.open();
        assert.equal(empty.byText(select(0)).disabled, true); assert.equal(empty.byText(deselect(0)).disabled, true);
        assert.equal(empty.byText(select(0)).type, 'button'); assert.equal(empty.byText(deselect(0)).type, 'button');
        empty.click(select(0)); empty.click(deselect(0)); assert.equal(empty.writes, 0);
        const h = model({ locale }); await h.view.open(); h.target('later'); h.query('orphan.example'); h.click(select(1)); h.query('no-results');
        assert.equal(h.byText(select(0)).disabled, true); assert.equal(h.byText(deselect(0)).disabled, true);
        assert.equal(h.count(), `${messages.organizerMatches.message}: 0 / 8 · ${messages.organizerSelected.message}: 1 · ${messages.organizerHiddenSelected.message}: 1`);
        const count = h.document.querySelector('.organizer-count');
        assert.equal(count.getAttribute('role'), 'status'); assert.equal(count.getAttribute('aria-live'), 'polite'); assert.equal(count.getAttribute('aria-atomic'), 'true');
        h.click(select(0)); h.click(deselect(0)); h.click(messages.organizerReview.message);
        assert.equal(h.document.querySelectorAll('li').length, 1); assert.equal(h.writes, 0);
    }
});

test('current-match changes preserve search and row nodes and keep keyboard focus in the dialog before disabling an action', async () => {
    const h = model(); const opener = h.byText('Organize saved sites'); opener.focus(); await h.view.open(); h.target('later'); h.query('Alpha');
    const search = h.search(), rows = h.checks(), select = h.byText('Select current matches (3)'), deselect = h.byText('Deselect current matches (0)');
    search.focus(); search.selectionStart = 1; search.selectionEnd = 3;
    h.click('Select current matches (3)');
    assert.equal(h.document.activeElement, search); assert.equal(h.search(), search); assert.deepEqual(h.checks(), rows);
    assert.equal(search.selectionStart, 1); assert.equal(search.selectionEnd, 3);
    deselect.focus(); h.click('Deselect current matches (3)');
    assert.equal(h.document.activeElement, select); assert.equal(deselect.disabled, true); assert.equal(select.disabled, false);
    select.dispatch('click', { detail: 0 });
    assert.equal(h.document.activeElement, deselect); assert.equal(select.disabled, true); assert.equal(deselect.disabled, false);
    const tab = h.document.activeElement.dispatch('keydown', { key: 'Tab' });
    assert.equal(tab.prevented, false); assert.equal(h.document.querySelector('.organizer-panel').contains(h.document.activeElement), true);
    const escape = h.document.activeElement.dispatch('keydown', { key: 'Escape' });
    assert.equal(escape.prevented, true); assert.equal(h.view.hasUncommittedWork(), false); assert.equal(h.document.activeElement, opener);
    assert.equal(h.writes, 0); assert.equal(h.networks, 0);
});

test('current-match actions reject repeated and composing clicks, defer IME changes, and use only the committed visible list', async () => {
    const h = model(); await h.view.open(); h.target('later'); h.query('Alpha');
    const select = h.byText('Select current matches (3)'), deselect = h.byText('Deselect current matches (0)'), search = h.search();
    for (const fields of [{ repeat: true }, { detail: 2 }, { isComposing: true }, { keyCode: 229 }]) select.dispatch('click', fields);
    assert.deepEqual(h.selected(), []);
    search.focus(); search.dispatch('compositionstart'); h.query('中文', { isComposing: false });
    select.dispatch('click'); deselect.dispatch('click'); assert.deepEqual(h.visible(), [0, 1, 6]); assert.deepEqual(h.selected(), []);
    assert.equal(h.search(), search); assert.equal(h.document.activeElement, search);
    search.dispatch('compositionend'); assert.deepEqual(h.visible(), [2]); assert.equal(h.byText('Select current matches (1)'), select);
    select.dispatch('click', { detail: 0 }); assert.deepEqual(h.selected(), [2]);
    for (const fields of [{ repeat: true }, { detail: 2 }, { isComposing: true }, { keyCode: 229 }]) deselect.dispatch('click', fields);
    assert.deepEqual(h.selected(), [2]);
    search.dispatch('compositionstart'); h.query('Alpha'); deselect.dispatch('click'); assert.deepEqual(h.selected(), [2]);
    search.dispatch('focusout'); assert.deepEqual(h.visible(), [0, 1, 6]);
    assert.equal(h.byText('Deselect current matches (0)').disabled, true); deselect.dispatch('click');
    assert.match(h.count(), /Selected sites: 1 · Hidden selected sites: 1$/); assert.equal(h.writes, 0); assert.equal(h.reads, 1);
});

test('current-match Review Back restores query and exact choices while detached and reattached older controls stay fenced', async () => {
    const h = model(); await h.view.open(); h.target('later'); h.check(2); h.query('[draft]*?');
    const oldSelect = h.byText('Select current matches (2)'), oldDeselect = h.byText('Deselect current matches (0)');
    h.click('Select current matches (2)'); h.check(0, false); h.click('Review move');
    oldSelect.dispatch('click'); oldDeselect.dispatch('click'); h.click('Back');
    assert.equal(h.search().value, '[draft]*?'); assert.equal(h.document.querySelector('select').value, 'later'); assert.deepEqual(h.selected(), [1]);
    assert.match(h.count(), /Selected sites: 2 · Hidden selected sites: 1$/);
    // Force stale nodes back into the live body: the view revision must still fence them.
    const body = h.document.querySelector('.organizer-match-actions').parentElement;
    body.append(oldSelect, oldDeselect); oldSelect.disabled = oldDeselect.disabled = false;
    oldSelect.dispatch('click'); oldDeselect.dispatch('click'); assert.deepEqual(h.selected(), [1]);
    assert.match(h.count(), /Selected sites: 2 · Hidden selected sites: 1$/);
    h.click('Review move'); assert.deepEqual(h.document.querySelectorAll('li strong').map(node => Number(node.textContent.split('.')[0]) - 1), [1, 2]);
    h.click('Back'); h.click('Cancel'); await h.view.open(); h.target('later'); h.query('中文');
    h.document.querySelector('.organizer-match-actions').parentElement.append(oldSelect, oldDeselect);
    oldSelect.dispatch('click'); oldDeselect.dispatch('click');
    assert.equal(h.search().value, '中文'); assert.match(h.count(), /Selected sites: 0 · Hidden selected sites: 0$/);
    assert.equal(h.writes, 0); assert.equal(h.networks, 0); assert.deepEqual(h.snapshot, h.original);
});

test('current-match controls cannot alter a pending reviewed request or a departing selection', async () => {
    const h = model(); await h.view.open(); h.target('later'); h.check(1); h.query('Alpha');
    const select = h.byText('Select current matches (2)'), deselect = h.byText('Deselect current matches (1)'), before = h.count();
    h.context.LocalItabContentLifecycle.departing = true; select.dispatch('click'); deselect.dispatch('click');
    assert.equal(h.count(), before); assert.deepEqual(h.selected(), [1]); h.context.LocalItabContentLifecycle.departing = false;
    const body = select.parentElement.parentElement; h.click('Review move');
    const pending = deferred(); h.pendingWrite = pending; h.click('Move reviewed sites');
    body.append(select, deselect); select.disabled = deselect.disabled = false; select.dispatch('click'); deselect.dispatch('click');
    assert.equal(h.view.pending, true); assert.equal(h.view.close(), false); assert.deepEqual(Array.from(h.savedRequest.indices), [1]);
    assert.equal(h.savedRequest.destination, 'later'); assert.equal(h.writes, 1);
    assert.equal(h.document.activeElement, h.document.querySelector('.organizer-panel'));
    pending.resolve(); await tick(); assert.equal(h.view.hasUncommittedWork(), false); assert.deepEqual(h.snapshot, h.original);
});

test('current-match reviewed selection uses one original storage transaction and changes only the chosen category fields', async () => {
    const StorageManager = require('../storage.js');
    const h = model(), manager = new StorageManager(), state = clone(h.original.state);
    for (const link of state.links) link.icon = '★';
    state.layout.positions['all|https://duplicate.example/path?q=1'] = { x: 12, y: 24 };
    state.extraModule = { revision: 4, notes: ['synthetic preserved value'] };
    const original = clone(state); let reads = 0, writes = 0; const writtenKeys = [];
    manager._syncInitialized = true; manager.withLocalWriteLock = work => Promise.resolve().then(work); manager.scheduleShortcutUndoSync = async () => {};
    Object.defineProperty(manager, '_local', { value: {
        async get() { reads++; return clone(state); },
        async set(values) { writes++; writtenKeys.push(Object.keys(values)); Object.assign(state, clone(values)); }
    } });
    h.context.storageManager = manager;
    h.component.moveReviewedShortcuts = request => manager.moveShortcutsToCategory(request);
    await h.view.open(); const initialReads = reads; h.target('later'); h.check(2); h.query('Alpha');
    h.click('Select current matches (3)'); h.check(0, false); h.query('orphan-分类');
    h.click('Select current matches (1)'); h.check(7, false); h.query('no-results');
    assert.equal(reads, initialReads); assert.equal(writes, 0); assert.deepEqual(state, original);
    h.click('Review move'); assert.deepEqual(h.document.querySelectorAll('li strong').map(node => Number(node.textContent.split('.')[0]) - 1), [1, 2, 6]);
    h.click('Move reviewed sites'); h.click('Move reviewed sites'); await tick();
    const expected = clone(original); for (const index of [1, 2, 6]) expected.links[index].category = 'later';
    assert.deepEqual(state, expected); assert.equal(writes, 1); assert.deepEqual(writtenKeys, [['links']]);
    assert.equal(h.view.hasUncommittedWork(), false); assert.equal(h.networks, 0);
});
