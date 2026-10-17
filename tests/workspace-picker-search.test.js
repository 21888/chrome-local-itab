const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');

// Synthetic DOM ownership tests, not native Chrome keyboard or layout evidence.
const source = fs.readFileSync('shared/workspaces-view.js', 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const entry = (id, name, order, deletedAt = null) => ({ id, name, order, deletedAt, generation: `generation-${id}` });
function model({ locale = 'en', entries, saveMode = 'success' } = {}) {
    const document = createDocument({ blurUnavailableFocus: true });
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const switcher = document.createElement('section');
    document.body.append(switcher);
    const registry = { defaultId: 'default', lastUsedId: 'default', workspaces: entries || [
        entry('default', 'Default', 1), entry('work', 'Work [2026] 🧭', 0),
        entry('research', '研究 Lab +.*', 2), entry('twin-a', 'Twin', 3), entry('twin-b', 'Twin', 4),
        entry('trashed', 'TrashOnly', 5, 123)
    ] };
    const calls = [], listeners = new Set();
    const record = (name, ...args) => calls.push([name, ...args]);
    const manager = {
        list: async () => { record('list'); return clone(registry); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        select: async id => { record('select', id); }
    };
    const session = {
        id: 'default', generation: 'generation-default', ready: async () => { record('ready'); },
        flush: async () => { record('flush'); }, suspendWrites: () => record('suspend'), resumeWrites: () => record('resume')
    };
    const window = {
        document, location: { href: 'chrome-extension://synthetic/newtab.html' },
        chrome: { runtime: { getURL: path => `chrome-extension://synthetic/${path}` }, storage: {
            local: { get: () => record('storage-get'), set: () => record('storage-set') }
        } },
        localStorage: { getItem: () => record('storage-get'), setItem: () => record('storage-set') },
        i18n: { t: key => catalog[key]?.message || key }
    };
    let dirty = false;
    window.localScratchpadView = {
        hasUncommittedWork: () => dirty,
        controller: {
            hasUncommittedWork: () => dirty, cancelTimer: () => record('cancel-timer'), schedule: () => record('schedule'),
            save: async () => {
                record('scratch-save');
                if (saveMode === 'failure') throw new Error('Synthetic failed save');
                if (saveMode === 'success') dirty = false;
            }
        }
    };
    vm.runInNewContext(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), { window, document, setTimeout });
    const lifecycle = window.LocalItabContentLifecycle;
    for (const name of ['waitForPending', 'hasUncommittedWork', 'saveDrafts', 'pauseAutosave', 'resumeAutosave', 'allowDeparture', 'cancelDeparture']) {
        const original = lifecycle[name];
        lifecycle[name] = (...args) => { record(name, ...args); return original(...args); };
    }
    vm.runInNewContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), { window });
    vm.runInNewContext(source, { window, URL, Blob, setTimeout });
    const view = window.LocalItabWorkspacesView.mount({ switcher, manager, session, lifecycle, navigate: id => record('navigate', id) });
    const dialog = () => document.querySelector('.spaces-dialog');
    const input = () => dialog()?.querySelector('.spaces-picker-search');
    const results = () => dialog()?.querySelector('.spaces-picker').children || [];
    const find = key => dialog()?.querySelectorAll('button').find(button => button.textContent === catalog[`spaces${key}`]?.message);
    const open = () => { const opener = switcher.querySelector('.spaces-switch'); opener.focus(); opener.dispatch('click'); return input(); };
    const search = value => { const field = input(); field.value = value; field.dispatch('input'); };
    return { document, window, registry, manager, session, lifecycle, view, calls, catalog, switcher, dialog, input, results, find, open, search,
        ids: () => Array.from(results(), button => button.dataset.workspaceId),
        dirty: value => { if (value !== undefined) dirty = value; return dirty; },
        notify: () => listeners.forEach(fn => fn(registry)) };
}

test('workspace picker search: opens a labelled local name filter without I/O or autosave changes', async () => {
    const m = model(); await m.view.ready; m.calls.length = 0;
    const input = m.open();
    assert(input, 'The picker must expose its own name search field');
    assert.equal(m.document.activeElement, input);
    assert.equal(input.type, 'search');
    assert.equal(input.closest('label').textContent, m.catalog.spacesSearchName.message);
    m.search('work');
    assert.deepEqual(m.ids(), ['work']);
    assert.deepEqual(m.calls, []);
    assert.equal(m.lifecycle.autosavePaused, false);
});

test('workspace picker search: literal displayed names preserve order, same-name IDs, current and Trash boundaries', async () => {
    const m = model(); m.registry.workspaces[2].alias = 'HiddenAlias'; await m.view.ready; m.open();
    const cases = [
        ['', ['work', 'default', 'research', 'twin-a', 'twin-b']], ['  wORk  ', ['work']],
        ['研究', ['research']], ['🧭', ['work']], ['[2026]', ['work']], ['+.*', ['research']],
        ['.*', ['research']], ['[', ['work']], ['Twin', ['twin-a', 'twin-b']],
        ['twin-a', []], ['HiddenAlias', []], ['This tab', []], ['TrashOnly', []], ['Work 🧭', []]
    ];
    for (const [query, expected] of cases) { m.search(query); assert.deepEqual(m.ids(), expected, query); }
    m.search('default'); assert.equal(m.results()[0].disabled, true);
    assert.equal(m.dialog().querySelector('.spaces-picker-count').textContent, '1 of 5 workspaces');
    m.calls.length = 0; m.results()[0].dispatch('click'); assert.deepEqual(m.calls, []);
});

for (const locale of ['en', 'zh_CN']) test(`workspace picker search: labels, count and empty state are localized without renaming Default (${locale})`, async () => {
    const m = model({ locale }); await m.view.ready; m.open();
    const count = m.dialog().querySelector('.spaces-picker-count');
    assert.equal(m.input().closest('label').textContent, m.catalog.spacesSearchName.message);
    assert.equal(count.getAttribute('role'), 'status'); assert.equal(count.getAttribute('aria-live'), 'polite');
    assert.equal(m.input().getAttribute('aria-describedby'), count.id);
    assert.equal(count.textContent, m.catalog.spacesSearchCount.message.replace('{count}', '5').replace('{total}', '5'));
    assert(m.results().some(button => button.textContent === `Default · ${m.catalog.spacesLoaded.message}`));
    m.search('Not present');
    assert.equal(count.textContent, m.catalog.spacesSearchCount.message.replace('{count}', '0').replace('{total}', '5'));
    assert.equal(m.dialog().querySelector('.spaces-empty').textContent, m.catalog.spacesSearchEmpty.message);
    assert.equal(m.dialog().querySelector('.spaces-empty').hidden, false);
    assert.equal(m.find('ClearSearch').disabled, false); assert(m.find('Close'));
});

test('workspace picker search: clearing no results returns focus before disabling Clear and restores original order', async () => {
    const m = model(); await m.view.ready; const input = m.open(); m.calls.length = 0;
    m.search('not found'); const clear = m.find('ClearSearch'); clear.focus(); clear.dispatch('click');
    assert.equal(m.document.activeElement, input); assert.equal(input.value, ''); assert.equal(clear.disabled, true);
    assert.equal(m.input(), input); assert.deepEqual(m.ids(), ['work', 'default', 'research', 'twin-a', 'twin-b']);
    assert.equal(m.dialog().querySelector('.spaces-empty').hidden, true); assert.deepEqual(m.calls, []);
    m.search('   '); assert.equal(clear.disabled, false); clear.focus(); clear.dispatch('click');
    assert.equal(m.document.activeElement, input); assert.deepEqual(m.calls, []);
});

test('workspace picker search: an explicit same-name result selects only its original ID through the existing flush chain', async () => {
    const m = model(); await m.view.ready; m.open(); m.search('Twin'); m.calls.length = 0;
    m.results()[1].dispatch('click'); await tick();
    assert.deepEqual(m.calls.filter(call => ['flush', 'suspend', 'select', 'navigate'].includes(call[0])),
        [['flush'], ['suspend'], ['flush'], ['select', 'twin-b'], ['navigate', 'twin-b']]);
});

test('workspace picker search: input, clearing and Enter never save, select or pause a dirty page', async () => {
    const m = model(); await m.view.ready; m.dirty(true); const input = m.open(); m.calls.length = 0;
    m.search('work');
    input.dispatch('keydown', { key: 'Enter' }); input.dispatch('keydown', { key: 'Enter', repeat: true });
    input.dispatch('keydown', { key: 'Enter', isComposing: true }); input.dispatch('keydown', { key: 'Enter', keyCode: 229 });
    m.find('ClearSearch').dispatch('click'); await tick();
    assert.deepEqual(m.calls, []); assert.equal(m.dirty(), true); assert.equal(m.lifecycle.autosavePaused, false);
    assert.equal(m.input(), input);
});

test('workspace picker search: refresh leaves the opening snapshot, input and caret intact; reopening uses latest loaded names', async () => {
    const m = model(); await m.view.ready; const input = m.open(); m.search('work');
    input.selectionStart = 2; input.selectionEnd = 3;
    const panel = m.dialog();
    m.registry.workspaces[1].name = 'Changed elsewhere'; m.registry.workspaces[1].deletedAt = 234;
    m.registry.workspaces.push(entry('new', 'Newly loaded', -1)); await m.view.refresh();
    m.calls.length = 0;
    assert.equal(m.dialog(), panel); assert.equal(m.input(), input); assert.equal(input.value, 'work');
    assert.equal(m.document.activeElement, input); assert.equal(input.selectionStart, 2); assert.equal(input.selectionEnd, 3);
    assert.deepEqual(m.ids(), ['work']); assert.equal(m.results()[0].textContent, 'Work [2026] 🧭');
    m.find('ClearSearch').dispatch('click'); assert.deepEqual(m.ids(), ['work', 'default', 'research', 'twin-a', 'twin-b']);
    m.find('Close').dispatch('click'); assert.equal(m.document.activeElement, m.switcher.querySelector('.spaces-switch'));
    const newer = m.open(); assert.notEqual(newer, input); assert.equal(newer.value, '');
    assert.deepEqual(m.ids(), ['new', 'default', 'research', 'twin-a', 'twin-b']); assert.deepEqual(m.calls, []);
});

test('workspace picker search: IME defers filtering until composition ends and shared Escape keeps ownership', async () => {
    const m = model(); await m.view.ready; const input = m.open(); m.search('work');
    const previous = m.results()[0]; const panel = m.dialog(); m.calls.length = 0;
    input.dispatch('compositionstart'); input.value = '研究'; input.selectionStart = input.selectionEnd = 2;
    input.dispatch('input'); input.dispatch('input', { isComposing: true });
    input.dispatch('keydown', { key: 'Enter', isComposing: true }); input.dispatch('keydown', { key: 'Escape' });
    assert.equal(m.dialog(), panel); assert.equal(m.results()[0], previous); assert.deepEqual(m.ids(), ['work']);
    await m.view.refresh(); assert.equal(m.input(), input); assert.equal(input.value, '研究');
    assert.equal(input.selectionStart, 2); assert.equal(input.selectionEnd, 2); assert.equal(m.results()[0], previous);
    input.dispatch('compositionend'); assert.deepEqual(m.ids(), ['research']); assert.equal(m.document.activeElement, input);
    assert.deepEqual(m.calls, [['list']]);
    input.dispatch('keydown', { key: 'Escape' }); assert.equal(m.dialog(), null);
    assert.equal(m.document.activeElement, m.switcher.querySelector('.spaces-switch'));
});

test('workspace picker search: dynamic Tab trap has only current visible enabled controls, including zero matches', async () => {
    const m = model(); await m.view.ready; const input = m.open();
    assert.equal(m.find('ClearSearch').disabled, true);
    input.dispatch('keydown', { key: 'Tab', shiftKey: true }); assert.equal(m.document.activeElement, m.find('Close'));
    m.find('Close').dispatch('keydown', { key: 'Tab' }); assert.equal(m.document.activeElement, input);
    m.search('Twin'); const result = m.results()[0]; result.focus(); m.search('none');
    assert.equal(m.document.activeElement, input, 'removing the focused result must not leave focus on body');
    const overlay = m.dialog().parentElement;
    const enabled = overlay.querySelectorAll('button, input').filter(node => !node.disabled && !node.closest('[hidden], [inert]') && node.getClientRects().length);
    assert.deepEqual(enabled, [input, m.find('ClearSearch'), m.find('Close')]);
    input.dispatch('keydown', { key: 'Tab', shiftKey: true }); assert.equal(m.document.activeElement, m.find('Close'));
    m.find('Close').dispatch('keydown', { key: 'Tab' }); assert.equal(m.document.activeElement, input);
});

test('workspace picker search: composing result activation is blocked until a normal explicit click', async () => {
    const m = model(); await m.view.ready; const input = m.open(); m.search('work'); m.calls.length = 0;
    input.dispatch('compositionstart');
    const composingResult = m.results()[0];
    for (const key of ['Enter', ' ']) assert.equal(composingResult.dispatch('keydown', { key }).prevented, true);
    composingResult.dispatch('click', { detail: 0 }); await tick(); assert.deepEqual(m.calls, []);
    input.dispatch('compositionend');
    const result = m.results()[0];
    for (const fields of [{ isComposing: true }, { keyCode: 229 }]) {
        for (const key of ['Enter', ' ']) assert.equal(result.dispatch('keydown', { key, ...fields }).prevented, true);
        result.dispatch('click', { detail: 0, ...fields });
    }
    await tick(); assert.deepEqual(m.calls, []); assert.equal(m.results()[0], result);
    result.dispatch('click'); await tick();
    assert.deepEqual(m.calls.filter(call => call[0] === 'navigate'), [['navigate', 'work']]);
});

test('workspace picker search: hidden composition end or blur releases state without filtering until the next visible input', async () => {
    const m = model(); await m.view.ready; const input = m.open(); m.calls.length = 0;
    for (const event of ['compositionend', 'focusout']) {
        m.search('work'); const previous = m.results()[0]; input.dispatch('compositionstart');
        input.value = '研究'; m.document.hidden = true; input.dispatch(event);
        assert.equal(m.results()[0], previous, `${event} must not filter hidden UI`);
        assert.equal(input.value, '研究'); assert.deepEqual(m.calls, []);
        m.document.hidden = false; m.search('Twin');
        assert.deepEqual(m.ids(), ['twin-a', 'twin-b'], `${event} must release this opening's composition state`);
        assert.equal(m.input(), input); assert.deepEqual(m.calls, []);
    }
});

test('workspace picker search: filtered, detached and reattached old result buttons cannot switch', async () => {
    const m = model(); await m.view.ready; m.open(); const stale = m.results()[0]; m.calls.length = 0;
    m.search('Twin'); stale.dispatch('click'); await tick(); assert.deepEqual(m.calls, []);
    m.dialog().querySelector('.spaces-picker').append(stale); stale.dispatch('click'); await tick();
    assert.deepEqual(m.calls, []); assert(m.input());
    m.search('work'); assert.notEqual(m.results()[0], stale);
    stale.dispatch('click'); await tick(); assert.deepEqual(m.calls, []);
});

test('workspace picker search: closed, reopened and destroyed controls cannot mutate or navigate newer dialogs', async () => {
    const m = model(); await m.view.ready; const input = m.open(); m.search('work');
    const clear = m.find('ClearSearch'), result = m.results()[0], close = m.find('Close');
    close.dispatch('click'); const newer = m.open(); m.search('Twin'); m.calls.length = 0;
    input.value = 'research'; input.dispatch('input'); input.dispatch('compositionend'); clear.dispatch('click'); result.dispatch('click'); close.dispatch('click');
    // Even reattaching the old controls cannot make their old opening current.
    m.dialog().append(input, clear, result, close);
    input.dispatch('input'); clear.dispatch('click'); result.dispatch('click'); close.dispatch('click'); await tick();
    assert.equal(newer.value, 'Twin'); assert.deepEqual(m.ids(), ['twin-a', 'twin-b']); assert.deepEqual(m.calls, []);
    const current = m.results()[0]; m.view.destroy(); current.dispatch('click'); newer.dispatch('input'); await tick(); assert.deepEqual(m.calls, []);
});

test('workspace picker search: hidden or disabled local controls ignore synthetic events', async () => {
    const m = model(); await m.view.ready; const input = m.open(); m.search('work');
    const result = m.results()[0], clear = m.find('ClearSearch'), overlay = m.dialog().parentElement;
    m.calls.length = 0;
    for (const mode of ['document', 'overlay', 'aria', 'inert', 'display', 'disabled']) {
        if (mode === 'document') m.document.hidden = true;
        if (mode === 'overlay') overlay.classList.remove('active');
        if (mode === 'aria') overlay.setAttribute('aria-hidden', 'true');
        if (mode === 'inert') m.dialog().inert = true;
        if (mode === 'display') input.style.display = result.style.display = clear.style.display = 'none';
        if (mode === 'disabled') input.disabled = result.disabled = clear.disabled = true;
        input.value = 'Twin'; input.dispatch('input'); input.dispatch('compositionend'); clear.dispatch('click'); result.dispatch('click');
        assert.equal(m.results()[0], result, mode); assert.equal(input.value, 'Twin', mode); assert.deepEqual(m.calls, [], mode);
        m.document.hidden = false; overlay.classList.add('active'); overlay.setAttribute('aria-hidden', 'false'); m.dialog().inert = false;
        input.style.display = result.style.display = clear.style.display = ''; input.disabled = result.disabled = clear.disabled = false;
    }
});

for (const choice of ['Stay', 'SaveSwitch', 'DiscardSwitch']) test(`workspace picker search: filtered click retains the real dirty lifecycle decision (${choice})`, async () => {
    const m = model(); await m.view.ready; m.dirty(true); m.open(); m.search('Twin'); m.calls.length = 0;
    const result = m.results()[1]; result.dispatch('click'); result.dispatch('click'); await tick();
    assert.equal(m.input(), null); assert(m.find('Stay')); assert.equal(m.lifecycle.autosavePaused, true);
    assert.equal(m.dirty(), true); assert(!m.calls.some(call => ['select', 'navigate', 'saveDrafts', 'scratch-save'].includes(call[0])));
    m.find(choice).dispatch('click'); await tick();
    if (choice === 'Stay') {
        assert.equal(m.lifecycle.autosavePaused, false); assert.equal(m.dirty(), true);
        assert(!m.calls.some(call => ['select', 'navigate', 'scratch-save'].includes(call[0])));
    } else {
        assert.deepEqual(m.calls.filter(call => call[0] === 'select'), [['select', 'twin-b']]);
        assert.deepEqual(m.calls.filter(call => call[0] === 'navigate'), [['navigate', 'twin-b']]);
        assert.equal(m.calls.some(call => call[0] === 'scratch-save'), choice === 'SaveSwitch');
        assert.equal(m.dirty(), choice === 'DiscardSwitch'); assert.equal(m.lifecycle.departing, true);
    }
});

for (const saveMode of ['failure', 'incomplete']) test(`workspace picker search: real dirty save ${saveMode} preserves draft and refuses navigation`, async () => {
    const m = model({ saveMode }); await m.view.ready; m.dirty(true); m.open(); m.search('work'); m.calls.length = 0;
    m.results()[0].dispatch('click'); await tick(); m.find('SaveSwitch').dispatch('click'); await tick();
    assert(m.find('Stay')); assert.equal(m.dirty(), true); assert.equal(m.lifecycle.departing, false);
    assert(!m.calls.some(call => ['select', 'navigate'].includes(call[0])));
    m.find('Stay').dispatch('click'); assert.equal(m.lifecycle.autosavePaused, false);
});

test('workspace picker search: the first explicit result click still waits for pending writes before the dirty decision', async () => {
    const m = model(); await m.view.ready; m.dirty(true); m.open(); m.search('work');
    const gate = deferred(); let pending = true;
    m.window.settingsFormView = { flush: () => gate.promise, get pending() { return pending; }, hasUncommittedWork: () => false };
    m.calls.length = 0; const result = m.results()[0]; result.dispatch('click'); result.dispatch('click'); await tick();
    assert.equal(m.dialog(), null); assert(!m.calls.some(call => ['flush', 'select', 'navigate'].includes(call[0])));
    pending = false; gate.resolve(); await tick(); assert(m.find('Stay'));
    assert.equal(m.calls.filter(call => call[0] === 'flush').length, 1); assert(!m.calls.some(call => ['select', 'navigate'].includes(call[0])));
    m.find('Stay').dispatch('click');
});

test('workspace picker search: at the bounded 100-entry registry limit only 99 active names are counted', async () => {
    const entries = [entry('default', 'Default', 0), ...Array.from({ length: 98 }, (_, i) => entry(`synthetic-${i}`, `Synthetic ${i}`, i + 1)), entry('trash', 'Synthetic Trash', 99, 1)];
    assert.equal(entries.length, 100);
    const m = model({ entries }); await m.view.ready; m.open(); m.calls.length = 0;
    assert.equal(m.results().length, 99); assert.equal(m.dialog().querySelector('.spaces-picker-count').textContent, '99 of 99 workspaces');
    m.search('Synthetic 97'); assert.deepEqual(m.ids(), ['synthetic-97']);
    m.find('ClearSearch').dispatch('click'); assert.equal(m.results().length, 99); assert.deepEqual(m.calls, []);
});

test('workspace picker search: search controls have narrow-layout and inherited accessible focus styles', () => {
    const css = fs.readFileSync('workspaces.css', 'utf8');
    assert.match(css, /\.spaces-name-input, \.spaces-picker-search\s*\{[^}]*width: 100%[^}]*box-sizing: border-box/);
    assert.match(css, /\.spaces-picker-search\s*\{\s*min-width: 0/);
    assert.match(css, /\.spaces-picker-tools\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/);
    assert.match(css, /@media \(max-width: 420px\)\s*\{\s*\.spaces-picker-tools\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(css, /\.spaces-picker-label\s*\{[^}]*min-width: 0[^}]*overflow-wrap: anywhere/);
    assert.match(css, /\.spaces-overlay :focus-visible/);
});
