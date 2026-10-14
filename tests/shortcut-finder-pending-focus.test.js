const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/finder-dom-model');

const tick = () => new Promise(setImmediate);
function fixture({ locale = 'en', reserveBlocked = false, openBlocked = false } = {}) {
    const document = createDocument({ blurUnavailableFocus: true });
    const host = document.createElement('header'); document.body.append(host);
    const messages = JSON.parse(fs.readFileSync(require.resolve(`../_locales/${locale}/messages.json`), 'utf8'));
    const read = deferred();
    let snapshot = { links: [{ layoutId: 'focus-site', title: 'Synthetic site', url: 'https://example.test/', category: 'work' }], categories: [{ id: 'work', name: 'Work' }] };
    const original = JSON.stringify(snapshot);
    let opens = 0, closes = 0;
    const context = { window: null, document, URL, i18n: { t: key => messages[key]?.message || key } }; context.window = context;
    vm.createContext(context);
    for (const name of ['dialog-focus', 'shortcut-finder', 'shortcut-finder-view']) {
        vm.runInContext(fs.readFileSync(require.resolve(`../shared/${name}.js`), 'utf8'), context);
    }
    const view = context.LocalItabFinder.mount(host, {
        getSnapshot: () => snapshot,
        async readSnapshot() { const value = await read.promise; snapshot = value; return value; },
        reserve: () => reserveBlocked ? null : ({ open() { opens++; return !openBlocked; }, close() { closes++; } })
    });
    const opener = host.querySelector('button'); opener.focus(); opener.dispatch('click');
    const input = document.querySelector('.finder-input'); input.value = 'Synthetic'; input.dispatch('input');
    const result = document.querySelector('.finder-result');
    return { document, view, opener, input, result, messages, read,
        snapshot: () => snapshot, original, opens: () => opens, closes: () => closes,
        category: document.querySelector('.finder-category'), mode: document.querySelector('.finder-match-mode'),
        overlay: () => document.querySelector('.finder-overlay'),
        button: key => document.querySelectorAll('button').find(node => node.textContent === messages[key].message) };
}
function activateFocused(f) {
    f.input.dispatch('keydown', { key: 'ArrowDown' });
    assert.ok(f.document.activeElement === f.result);
    f.result.dispatch('click', { detail: 0 });
}

for (const locale of ['en', 'zh_CN']) {
    test(`pending Finder result retains keyboard cancellation in ${locale}`, async () => {
        const f = fixture({ locale }); activateFocused(f);
        assert.equal(f.view.pending, true);
        assert.equal(f.result.disabled, true);
        assert.ok(f.document.activeElement === f.input, 'move before disabling the result so focus stays inside the dialog');
        assert.equal(f.document.querySelector('.finder-list').getAttribute('aria-busy'), 'true');
        assert.equal(f.document.querySelector('.finder-alert').textContent, f.messages.finderPending.message);
        const escape = f.document.activeElement.dispatch('keydown', { key: 'Escape' });
        assert.equal(escape.prevented, true); assert.equal(f.overlay(), null);
        assert.ok(f.document.activeElement === f.opener); assert.equal(f.view.pending, false);
        assert.equal(f.closes(), 1); assert.equal(f.opens(), 0);
        f.read.resolve(f.snapshot()); await tick();
        assert.equal(f.opens(), 0); assert.equal(f.closes(), 1);
        assert.equal(JSON.stringify(f.snapshot()), f.original); f.view.destroy();
    });
}

test('pending Finder keeps Tab trapped and leaves selectors available for a changed search', async () => {
    const f = fixture(); activateFocused(f);
    const event = f.document.activeElement.dispatch('keydown', { key: 'Tab', shiftKey: true });
    assert.equal(event.prevented, true);
    assert.equal(f.document.activeElement, f.button('finderClose'));
    f.mode.focus(); f.mode.value = 'all-words'; f.mode.dispatch('change');
    assert.equal(f.view.pending, false); assert.equal(f.closes(), 1);
    assert.ok(f.document.activeElement === f.mode); assert.equal(f.input.value, 'Synthetic');
    f.read.resolve(f.snapshot()); await tick(); assert.equal(f.opens(), 0); f.view.destroy();
});

for (const outcome of ['opened', 'stale', 'read-error', 'open-blocked']) {
    test(`Finder ${outcome} completion preserves newer control focus`, async () => {
        const f = fixture({ openBlocked: outcome === 'open-blocked' }); activateFocused(f);
        assert.ok(f.document.activeElement === f.input);
        f.category.focus();
        // A rejected read is caught by the controller; all outcomes are resolved here.
        if (outcome === 'read-error') {
            f.read.resolve(Promise.reject(new Error('Synthetic read failure')));
        } else f.read.resolve(outcome === 'stale' ? { ...f.snapshot(), links: [] } : f.snapshot());
        await tick();
        assert.equal(f.view.pending, false); assert.ok(f.document.activeElement === f.category);
        assert.equal(f.input.value, 'Synthetic'); assert.equal(f.mode.value, 'phrase');
        assert.equal(f.document.querySelector('.finder-list').getAttribute('aria-busy'), 'false');
        assert.equal(f.opens(), ['opened', 'open-blocked'].includes(outcome) ? 1 : 0);
        assert.equal(f.closes(), outcome === 'opened' ? 0 : 1);
        if (outcome !== 'opened') assert.equal(f.document.querySelector('.finder-alert').textContent,
            f.messages[{ stale: 'finderChanged', 'read-error': 'finderReadError', 'open-blocked': 'finderBlocked' }[outcome]].message);
        f.view.destroy();
    });
}

test('a result click does not reclaim newer query, selector or close-button focus', async () => {
    for (const target of ['input', 'category', 'mode', 'close']) {
        const f = fixture(); const owner = target === 'close' ? f.button('finderClose') : f[target];
        owner.focus(); f.result.dispatch('click');
        assert.equal(f.view.pending, true); assert.ok(f.document.activeElement === owner);
        f.read.resolve(f.snapshot()); await tick(); assert.ok(f.document.activeElement === owner);
        f.view.destroy();
    }
});

test('unavailable popup reservation does not move a still-enabled focused result to the body', async () => {
    const f = fixture({ reserveBlocked: true }); activateFocused(f);
    assert.equal(f.view.pending, false); assert.equal(f.result.disabled, false);
    assert.ok(f.document.activeElement === f.result);
    await tick();
    assert.ok(f.document.activeElement === f.input, 'the usual failure-result refresh returns to the query');
    assert.equal(f.document.querySelector('.finder-alert').textContent, f.messages.finderBlocked.message);
    assert.equal(f.opens(), 0); assert.equal(f.closes(), 0); f.view.destroy();
});

test('cancelled old read cannot steal focus from a reopened Finder', async () => {
    const f = fixture(); activateFocused(f);
    f.document.activeElement.dispatch('keydown', { key: 'Escape' });
    assert.equal(f.overlay(), null);
    f.opener.dispatch('click'); const newMode = f.document.querySelector('.finder-match-mode'); newMode.focus();
    f.read.resolve(f.snapshot()); await tick();
    assert.ok(f.document.activeElement === newMode); assert.equal(f.view.pending, false);
    assert.equal(f.opens(), 0); assert.equal(f.closes(), 1); f.view.destroy();
});
