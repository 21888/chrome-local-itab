'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createDocument } = require('./helpers/finder-copy-dom-model');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setup({ links, writeText, locale, options = {} } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('header'); document.body.append(host);
    const calls = { writes: [], reads: 0, reserve: 0, opened: 0, clipboardReads: 0, permissions: 0 }, windowListeners = new Map();
    const messages = locale && JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales', locale, 'messages.json')));
    let snapshot = { links: links || [{ title: 'Site', url: 'example.test/原文?q=%2f&x=1#片段', category: 'work', layoutId: 'l_11111111111111111111111111111111' }], categories: [] }, notify;
    const context = { window: null, document, MutationObserver: document.MutationObserver, URL, navigator: { clipboard: { writeText(value) { calls.writes.push(value); return writeText ? writeText(value) : Promise.resolve(); }, readText() { calls.clipboardReads++; throw Error('No clipboard reads'); } }, permissions: { query() { calls.permissions++; throw Error('No permissions'); } } },
        i18n: { t: key => messages?.[key]?.message || key },
        addEventListener(type, fn) { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type).add(fn); },
        removeEventListener(type, fn) { windowListeners.get(type)?.delete(fn); } };
    context.window = context; vm.createContext(context);
    for (const file of ['shared/dialog-focus.js', 'shared/stored-shortcut-url.js', 'shared/shortcut-finder.js', 'shared/shortcut-finder-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    const view = context.LocalItabFinder.mount(host, { getSnapshot: () => snapshot, readSnapshot() { calls.reads++; return Promise.resolve(snapshot); }, reserve() { calls.reserve++; return { open() { calls.opened++; return true; }, close() {} }; }, subscribe(fn) { notify = fn; return () => { notify = null; }; }, ...options });
    const opener = host.querySelector('button');
    const open = () => { opener.dispatch('click'); query('Site'); };
    const query = value => { const input = document.querySelector('input'); input.value = value; input.dispatch('input'); };
    open();
    return { document, host, calls, context, view, opener, open, query, get snapshot() { return snapshot; }, set snapshot(value) { snapshot = value; }, notify: () => notify?.(),
        emit(type) { if (type === 'visibilitychange') document.listeners.get(type)?.(); for (const fn of windowListeners.get(type) || []) fn(); }, copies: () => document.querySelectorAll('.finder-copy-url'), feedback: () => document.querySelectorAll('.finder-copy-status').map(node => node.textContent || '') };
}
test('explicit copy writes the exact saved URL synchronously without activation, reads or permissions', async () => {
    const f = setup(), before = JSON.stringify(f.snapshot), copy = f.copies()[0];
    assert.ok(copy, 'each saved result needs a separate native Copy URL button');
    assert.equal(copy.tagName, 'BUTTON'); assert.equal(copy.type, 'button');
    assert.notEqual(copy, f.document.querySelector('.finder-result')); assert.equal(f.calls.writes.length, 0);
    copy.dispatch('click'); assert.deepEqual(f.calls.writes, [f.snapshot.links[0].url], 'write starts in the explicit activation stack');
    await tick(); assert.match(f.feedback().join(' '), /copied/i);
    assert.equal(f.calls.reads + f.calls.reserve + f.calls.opened + f.calls.clipboardReads + f.calls.permissions, 0);
    assert.equal(JSON.stringify(f.snapshot), before); f.view.destroy();
});
test('an outstanding system write remains locked across close/reopen; old completion has no new-panel feedback', async () => {
    const gate = deferred(), f = setup({ writeText: () => gate.promise }), old = f.copies()[0];
    assert.ok(old, 'copy action must exist before lifecycle checks');
    old.dispatch('click'); f.view.close(); f.open(); const current = f.copies()[0]; current.dispatch('click'); old.dispatch('click');
    assert.equal(f.calls.writes.length, 1); const focus = f.document.activeElement;
    gate.resolve(); await tick(); assert.equal(f.document.activeElement, focus); assert.deepEqual(f.feedback(), ['']);
    current.dispatch('click'); assert.equal(f.calls.writes.length, 2); await tick(); f.view.destroy();
});

test('raw Unicode, schemeless, case, percent escapes, query order and fragments stay byte-for-byte, including duplicate URLs', async () => {
    const urls = ['例子.测试/原文?q=%2f&x=1#片段', 'https://EXAMPLE.test/%e4%b8%ad?b=2&a=1&a=3#A', 'http://example.test:8080/path?token=ordinary-query#hash', 'example.test/path?x=1#y', 'example.test/path?x=1#y'];
    const f = setup({ links: urls.map((url, index) => ({ title: `Site ${index}`, url, category: index % 2 ? 'work' : 'learn', layoutId: `l_${String(index).padStart(32, '0')}` })) });
    for (const copy of f.copies()) { copy.dispatch('click', { detail: 0 }); await tick(); }
    assert.deepEqual(f.calls.writes, urls); assert.equal(f.calls.reads + f.calls.reserve, 0); f.view.destroy();
});
test('strict saved-URL admission blocks credentials, unsupported and repaired spellings even when row.safe allows them', () => {
    const urls = ['https://user:pass@example.test', 'https://user@example.test', 'example.test@evil.test', 'https://example.test\\@evil.test', ' https://example.test', 'https://example.test ', 'https://example.test/has space', 'https://example.test/%gg', 'javascript:alert(1)', 'data:text/plain,a', 'ftp://example.test', 'https://example.test/\npath', '/relative', '', 'HTTPS://example.test', 'https://example.test/\u202efoo'];
    const f = setup({ links: urls.map((url, index) => ({ title: `Site ${index}`, url })) });
    assert.equal(f.copies().length, urls.length);
    for (const copy of f.copies()) { assert.equal(copy.disabled, true); copy.dispatch('click'); }
    assert.equal(f.calls.writes.length + f.calls.reads + f.calls.reserve, 0); f.view.destroy();
});
test('paging preserves exact raw row identity and old reattached result controls cannot copy', async () => {
    const links = Array.from({ length: 51 }, (_, index) => ({ title: `Site ${index}`, url: `https://example.test/${index}?q=%2f#${index}`, layoutId: `l_${String(index).padStart(32, '0')}` }));
    const f = setup({ links }), old = f.copies()[0]; assert.equal(f.copies().length, 50);
    f.document.querySelectorAll('button').find(node => node.textContent === 'Next results').dispatch('click');
    assert.equal(f.copies().length, 1); f.copies()[0].dispatch('click'); await tick(); assert.deepEqual(f.calls.writes, [links[50].url]);
    old.remove(); f.document.querySelector('.finder-row').append(old); old.dispatch('click'); assert.equal(f.calls.writes.length, 1); f.view.destroy();
});
test('missing API, throwing getter/write and rejected write are retryable without fallback permissions or clipboard reads', async () => {
    for (const mode of ['missing', 'getter', 'throw', 'reject']) {
        const f = setup();
        if (mode === 'missing') f.context.navigator.clipboard = undefined;
        if (mode === 'getter') Object.defineProperty(f.context.navigator, 'clipboard', { configurable: true, get() { throw Error('denied'); } });
        if (mode === 'throw') f.context.navigator.clipboard.writeText = () => { throw Error('denied'); };
        if (mode === 'reject') f.context.navigator.clipboard.writeText = () => Promise.reject(Error('denied'));
        const copy = f.copies()[0]; copy.focus(); copy.dispatch('click'); await tick(); assert.match(f.feedback().join(' '), /unavailable|Could not copy/); assert.equal(f.document.activeElement, copy);
        Object.defineProperty(f.context.navigator, 'clipboard', { configurable: true, value: { writeText: value => { f.calls.writes.push(value); return Promise.resolve(); } } });
        copy.dispatch('click'); await tick(); assert.deepEqual(f.calls.writes, [f.snapshot.links[0].url]); assert.match(f.feedback().join(' '), /copied/);
        assert.equal(f.calls.permissions + f.calls.clipboardReads + f.calls.reads + f.calls.reserve, 0); f.view.destroy();
    }
});
test('only native click activates; Arrow keys keep the primary results sequence and copy keeps native Tab access', async () => {
    const f = setup({ links: [{ title: 'Site 1', url: 'https://one.test' }, { title: 'Site 2', url: 'https://two.test' }] });
    const input = f.document.querySelector('input'), results = f.document.querySelectorAll('.finder-result'), copies = f.copies();
    input.dispatch('keydown', { key: 'ArrowDown' }); assert.equal(f.document.activeElement, results[0]);
    results[0].dispatch('keydown', { key: 'ArrowDown' }); assert.equal(f.document.activeElement, results[1]);
    results[1].dispatch('keydown', { key: 'ArrowDown' }); assert.equal(f.document.activeElement, results[0]);
    input.dispatch('keydown', { key: 'ArrowUp' }); assert.equal(f.document.activeElement, results[1]);
    assert.equal(copies[0].tabIndex, 0); copies[0].focus();
    assert.equal(copies[0].dispatch('keydown', { key: 'ArrowDown' }).prevented, false); assert.equal(f.document.activeElement, copies[0]);
    for (const key of ['Enter', ' ']) { copies[0].dispatch('keydown', { key }); assert.equal(f.calls.writes.length, 0); }
    for (const fields of [{ defaultPrevented: true }, { repeat: true }, { isComposing: true }, { keyCode: 229 }]) { copies[0].dispatch('click', fields); assert.equal(f.calls.writes.length, 0); }
    for (const key of ['Enter', ' ']) {
        assert.equal(copies[0].dispatch('keydown', { key, repeat: true }).prevented, true);
        assert.equal(copies[0].dispatch('keydown', { key, isComposing: true }).prevented, true);
    }
    copies[0].dispatch('click', { detail: 0 }); await tick(); assert.equal(f.calls.writes.length, 1); assert.equal(f.document.activeElement, copies[0]); f.view.destroy();
});
test('copy state is independent from navigation pending and alert in both activation orders', async () => {
    const nav = deferred(), copy = deferred(), f = setup({ writeText: () => copy.promise, options: { readSnapshot: () => nav.promise } });
    const result = f.document.querySelector('.finder-result'), action = f.copies()[0], alert = f.document.querySelector('.finder-alert');
    result.dispatch('click'); assert.equal(f.view.pending, true); assert.match(alert.textContent, /Checking/); assert.equal(action.disabled, false);
    action.focus(); action.dispatch('click'); assert.equal(f.calls.writes.length, 1); assert.equal(f.document.activeElement, action); const navText = alert.textContent;
    copy.resolve(); await tick(); assert.equal(alert.textContent, navText); assert.match(f.feedback().join(' '), /copied/); assert.equal(f.view.pending, true);
    nav.resolve(f.snapshot); await tick(); assert.equal(f.calls.opened, 1); assert.match(f.feedback().join(' '), /copied/); f.view.destroy();
    const pendingCopy = deferred(), g = setup({ writeText: () => pendingCopy.promise, options: { reserve: () => null } });
    g.copies()[0].dispatch('click'); assert.equal(g.document.querySelector('.finder-result').disabled, false);
    g.document.querySelector('.finder-result').dispatch('click'); await tick(); const blocked = g.document.querySelector('.finder-alert').textContent; assert.match(blocked, /Could not open/);
    pendingCopy.resolve(); await tick(); assert.equal(g.document.querySelector('.finder-alert').textContent, blocked); assert.deepEqual(g.feedback(), ['']); g.view.destroy();
});
test('every rendered/filter/composition/visibility lifecycle retires old receipts without moving newer focus', async () => {
    for (const action of ['query', 'category', 'match', 'refresh', 'notify', 'composition', 'visibility', 'pagehide', 'close', 'destroy']) {
        const gate = deferred(), f = setup({ writeText: () => gate.promise }), old = f.copies()[0]; old.dispatch('click');
        if (action === 'query') f.query('Site');
        if (action === 'category') { const node = f.document.querySelector('.finder-category'); node.value = 'work'; node.dispatch('change'); }
        if (action === 'match') { const node = f.document.querySelector('.finder-match-mode'); node.value = 'all-words'; node.dispatch('change'); }
        if (action === 'refresh') f.view.refresh();
        if (action === 'notify') f.notify();
        if (action === 'composition') { f.document.querySelector('input').dispatch('compositionstart'); f.query('Site'); }
        if (action === 'visibility') { f.document.hidden = true; f.emit('visibilitychange'); f.document.hidden = false; f.emit('visibilitychange'); }
        if (action === 'pagehide') { f.emit('pagehide'); f.emit('pageshow'); }
        if (action === 'close') { f.view.close(); f.open(); }
        if (action === 'destroy') f.view.destroy();
        const active = f.document.querySelector('input'); active?.focus(); const focus = f.document.activeElement;
        gate.resolve(); await tick(); assert.equal(f.document.activeElement, focus, action); assert(!f.feedback().some(text => /copied|Could not copy/.test(text)), action);
        old.dispatch('click'); assert.equal(f.calls.writes.length, 1, action);
        if (action !== 'destroy') f.view.destroy();
    }
});
test('same-task detach/reconnect and hide/show ABA are fenced by MutationObserver.takeRecords before its callback', async () => {
    for (const targetName of ['copy', 'row', 'list', 'overlay', 'host']) {
        const f = setup(), copy = f.copies()[0], target = { copy, row: copy.parentElement, list: f.document.querySelector('.finder-list'), overlay: f.document.querySelector('.finder-overlay'), host: f.host }[targetName], parent = target.parentElement;
        target.remove(); parent.append(target); copy.dispatch('click'); assert.equal(f.calls.writes.length, 0, targetName);
        assert.equal(copy.getAttribute('aria-disabled'), 'true'); assert.match(f.document.querySelector('.finder-copy-notice').textContent, /refreshing/); f.view.destroy();
    }
    for (const targetName of ['copy', 'row', 'list', 'overlay', 'host']) {
        const f = setup(), copy = f.copies()[0], target = { copy, row: copy.parentElement, list: f.document.querySelector('.finder-list'), overlay: f.document.querySelector('.finder-overlay'), host: f.host }[targetName];
        target.hidden = true; target.hidden = false; copy.dispatch('click'); assert.equal(f.calls.writes.length, 0, targetName); f.view.destroy();
    }
    for (const attribute of ['inert', 'open']) {
        const f = setup(), copy = f.copies()[0], overlay = f.document.querySelector('.finder-overlay');
        overlay[attribute] = true; overlay[attribute] = false; copy.dispatch('click'); assert.equal(f.calls.writes.length, 0, attribute); f.view.destroy();
    }
    await tick();
});
test('old overlay and unrelated DOM mutations do not retire a new receipt, including while its write is pending', async () => {
    const gate = deferred(), f = setup({ writeText: () => gate.promise }), old = f.copies()[0], oldOverlay = f.document.querySelector('.finder-overlay');
    f.view.close(); f.open(); const current = f.copies()[0]; current.dispatch('click');
    old.remove(); oldOverlay.append(old); old.hidden = true; oldOverlay.inert = true;
    const unrelated = f.document.createElement('aside'), foreign = f.document.createElement('button'); foreign.className = 'finder-copy-url'; unrelated.append(foreign); f.document.body.append(unrelated); foreign.remove(); unrelated.hidden = true;
    gate.resolve(); await tick(); assert.match(f.feedback().join(' '), /copied/); assert.equal(current.getAttribute('aria-disabled'), 'false'); f.view.destroy();
});
test('current visibility/ownership guard covers hidden ancestors, disconnected nodes, closed details and destroyed opener', () => {
    for (const action of ['hidden-host', 'hidden-overlay', 'disconnected-list', 'inert-overlay', 'closed-details', 'destroyed']) {
        const f = setup(), copy = f.copies()[0];
        if (action === 'hidden-host') f.host.hidden = true;
        if (action === 'hidden-overlay') f.document.querySelector('.finder-overlay').hidden = true;
        if (action === 'disconnected-list') f.document.querySelector('.finder-list').remove();
        if (action === 'inert-overlay') f.document.querySelector('.finder-overlay').inert = true;
        if (action === 'closed-details') { const detail = f.document.createElement('details'); f.document.body.append(detail); f.host.remove(); detail.append(f.host); }
        if (action === 'destroyed') { f.view.destroy(); f.opener.dispatch('click'); }
        copy.dispatch('click'); assert.equal(f.calls.writes.length, 0, action); f.view.destroy();
    }
});
test('silent snapshot replacement, mutation, removal and ambiguous identities cannot copy from stale displayed records', () => {
    for (const action of ['replace', 'url', 'remove', 'duplicate-id', 'throws']) {
        const f = setup(), copy = f.copies()[0];
        if (action === 'replace') f.snapshot.links[0] = { ...f.snapshot.links[0] };
        if (action === 'url') f.snapshot.links[0].url = 'https://changed.test';
        if (action === 'remove') f.snapshot.links = [];
        if (action === 'duplicate-id') f.snapshot.links.push({ ...f.snapshot.links[0] });
        if (action === 'throws') f.snapshot = null;
        copy.dispatch('click'); assert.equal(f.calls.writes.length, 0); assert.match(f.feedback().join(' '), /changed/); f.view.destroy();
    }
});
test('All-workspace loaded rows use exact raw URL per occurrence and scope changes retire old receipts with no new copy read', async () => {
    const gate = deferred(); let scope = 'current';
    const f = setup({ writeText: () => gate.promise, options: { getScope: () => scope, setScope: value => { scope = value; } } });
    f.snapshot = { scope: 'all', links: [1, 2].map(index => ({ title: 'Site', url: 'example.test/原文?q=%2f#片段', category: `w${index}:work`, workspaceName: `Workspace ${index}`, finderToken: { workspace: index } })), categories: [] };
    const select = f.document.querySelector('.finder-workspace-scope'); select.value = 'all'; select.dispatch('change');
    assert.equal(f.copies().length, 2); f.copies()[1].dispatch('click'); assert.deepEqual(f.calls.writes, ['example.test/原文?q=%2f#片段']);
    select.value = 'current'; select.dispatch('change'); gate.resolve(); await tick(); assert.deepEqual(f.feedback(), ['', '']);
    f.snapshot.links[0].url = 'https://changed.test'; f.copies()[0].dispatch('click'); assert.equal(f.calls.writes.length, 1); assert.equal(f.calls.reads + f.calls.reserve, 0); f.view.destroy();
});
test('English, Chinese and missing-translation fallback label native copy and independent status', async () => {
    for (const locale of ['en', 'zh_CN', undefined]) {
        const f = setup({ locale }), copy = f.copies()[0]; assert.equal(copy.textContent, locale === 'zh_CN' ? '复制网址' : 'Copy URL');
        assert(copy.getAttribute('aria-label').includes(copy.textContent)); copy.dispatch('click'); await tick(); assert.match(f.feedback()[0], locale === 'zh_CN' ? /已复制网址/ : /URL copied/);
        f.emit('pagehide'); assert.match(f.document.querySelector('.finder-copy-notice').textContent, locale === 'zh_CN' ? /修改查询/ : /Change the search/); f.view.destroy();
    }
});
test('focused lifecycle fixture de-duplicates document listeners, removes by identity and keeps other listeners alive', () => {
    const document = createDocument(), calls = [], first = () => calls.push(1), second = () => calls.push(2);
    document.addEventListener('visibilitychange', first); document.addEventListener('visibilitychange', first); document.addEventListener('visibilitychange', second);
    document.listeners.get('visibilitychange')(); assert.deepEqual(calls, [1, 2]);
    document.removeEventListener('visibilitychange', first); document.listeners.get('visibilitychange')(); assert.deepEqual(calls, [1, 2, 2]);
    document.removeEventListener('visibilitychange', second); assert.equal(document.listeners.size, 0);
});

test('a fresh render binds the newly reparented host owner chain against same-task visibility ABA', () => {
    const f = setup(), wrapper = f.document.createElement('section'); f.document.body.append(wrapper);
    f.host.remove(); wrapper.append(f.host); f.query('Site');
    const copy = f.copies()[0]; wrapper.hidden = true; wrapper.hidden = false; copy.dispatch('click');
    assert.equal(f.calls.writes.length, 0); assert.equal(copy.getAttribute('aria-disabled'), 'true'); f.view.destroy();
});
test('closed-details and computed-visibility checks reject nonempty layout rectangles without blocking first-summary owners', async () => {
    for (const mode of ['closed', 'visibility-hidden', 'visibility-collapse', 'summary']) {
        const f = setup(), details = f.document.createElement('details'), summary = f.document.createElement('summary');
        details.append(summary); f.document.body.append(details); f.host.remove(); (mode === 'summary' ? summary : details).append(f.host);
        if (mode.startsWith('visibility')) details.open = true;
        f.host.getClientRects = () => [{}]; // Native details/visibility can retain layout boxes.
        f.context.getComputedStyle = node => ({ visibility: node === f.host && mode.startsWith('visibility') ? mode.slice('visibility-'.length) : 'visible' });
        f.query('Site'); f.copies()[0].dispatch('click'); await tick();
        assert.equal(f.calls.writes.length, mode === 'summary' ? 1 : 0, mode); f.view.destroy();
    }
});
test('a rejected old write releases a reopened view without overwriting its status or focus', async () => {
    const gate = deferred(), f = setup({ writeText: () => gate.promise }); f.copies()[0].dispatch('click'); f.view.close(); f.open();
    const copy = f.copies()[0], input = f.document.querySelector('input'); input.focus(); gate.reject(Error('late denial')); await tick();
    assert.equal(copy.getAttribute('aria-disabled'), 'false'); assert.deepEqual(f.feedback(), ['']); assert.equal(f.document.activeElement, input);
    f.context.navigator.clipboard.writeText = value => { f.calls.writes.push(value); return Promise.resolve(); }; copy.dispatch('click'); await tick(); assert.equal(f.calls.writes.length, 2); f.view.destroy();
});
