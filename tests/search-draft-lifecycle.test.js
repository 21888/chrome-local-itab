const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');

// Uses the actual search initializer, Sync listener, and lifecycle implementation.
// This small DOM model is not native Chromium/IME/popup verification.
function mount(engine = 'google', custom = '') {
    const document = createDocument(), events = [], opens = [], writes = [];
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    const host = document.createElement('section'); host.id = 'search-container'; document.body.append(host);
    let reloads = 0, pulls = 0, confirms = 0, decision = false, ignore = false, applied = true;
    let openResult = { closed: false };
    const storageManager = {
        syncMetaKey: 'meta', syncChunkPrefix: 'chunk', syncIdentityStateKey: 'guard',
        getSyncCompatibilityStatus: async () => null,
        shouldIgnoreRemoteSyncChange: async () => ignore,
        pullFromSync: async () => { pulls++; return { applied }; },
        set: async (...args) => { writes.push(args); return true; }
    };
    const window = {
        storageManager, addEventListener() {},
        open(...args) { opens.push(args); if (openResult instanceof Error) throw openResult; return openResult; },
        location: { reload() { reloads++; } }, confirm() { confirms++; return decision; }
    };
    const forbidden = () => { throw new Error('Unexpected draft persistence or network I/O'); };
    const context = { window, document, storageManager, URL, encodeURIComponent, console,
        fetch: forbidden, localStorage: { getItem: forbidden, setItem: forbidden },
        chrome: { storage: { onChanged: { addListener: fn => events.push(fn) } } } };
    vm.createContext(context);
    for (const file of ['shared/search-template.js', 'shared/local-calculator.js', 'shared/local-content-lifecycle.js', 'newtab.js']) {
        vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    }
    context.initializeSearchComponent({ engine, custom }); context.setupCloudSyncChangeListener();
    const input = host.querySelector('.search-input'), form = host.querySelector('form');
    const edit = value => { input.value = value; input.dispatch('input'); };
    const submit = async fields => {
        const event = { preventDefault() {}, ...fields };
        for (const listener of form.listeners.get('submit')) await listener(event);
    };
    return { document, host, window, context, input, opens, writes, edit, submit,
        owned: () => window.LocalItabContentLifecycle.hasUncommittedWork(),
        sync: (changes = { meta: { newValue: {} } }, area = 'sync') => events[0](changes, area),
        get reloads() { return reloads; }, get pulls() { return pulls; }, get confirms() { return confirms; },
        allow() { decision = true; }, ignore(value) { ignore = value; }, applied(value) { applied = value; },
        result(value) { openResult = value; } };
}

(async () => {
    for (const text of ['unfinished ordinary search', 'https://example.com/path?q=draft', 'example.com', '中文 搜索 🧭', '=42/7', '=1/0']) {
        const h = mount(); h.edit(text); h.input.focus();
        if (text.startsWith('=')) await h.submit();
        const status = h.host.querySelector('.search-calculator-status').textContent;
        await h.sync(); await h.sync();
        assert.equal(h.pulls, 2); assert.equal(h.reloads, 0); assert(h.owned());
        assert.equal(h.input.value, text); assert.equal(h.document.activeElement, h.input);
        assert.equal(h.host.querySelector('.search-calculator-status').textContent, status);
        assert.equal(h.document.querySelectorAll('#local-content-reload-notice').length, 1);
        h.document.querySelector('#local-content-reload-notice button').dispatch('click');
        assert.equal(h.confirms, 1); assert.equal(h.reloads, 0); assert.equal(h.input.value, text);
        h.allow(); h.document.querySelector('#local-content-reload-notice button').dispatch('click');
        assert.equal(h.reloads, 1); assert.equal(h.writes.length, 0); assert.equal(h.opens.length, 0);
    }
    for (const text of ['', '  \n\t', '\u3000\u00a0']) {
        const h = mount(); h.edit(text); await h.submit(); await h.sync();
        assert(!h.owned()); assert.equal(h.reloads, 1); assert.equal(h.opens.length, 0);
    }
    {
        const h = mount(); h.edit('中'); h.input.dispatch('compositionstart');
        await h.submit(); await h.submit({ isComposing: true });
        assert(h.input.dispatch('keydown', { key: 'Enter', isComposing: true }).prevented);
        assert(h.input.dispatch('keydown', { key: 'Enter', keyCode: 229 }).prevented);
        await h.sync(); assert.equal(h.reloads, 0); assert.equal(h.opens.length, 0);
        h.input.dispatch('compositionend'); h.edit('中文'); await h.sync();
        assert(h.owned()); assert.equal(h.input.value, '中文');
    }
    {
        const h = mount(); h.edit('draft');
        await h.sync({ __localItabPersonalTasksV1: { newValue: {} } }, 'local');
        await h.sync({ guard: { newValue: {} } }, 'local');
        await h.sync({ unrelated: { newValue: {} } });
        h.ignore(true); await h.sync(); assert.equal(h.pulls, 0);
        h.ignore(false); h.applied(false); await h.sync();
        assert.equal(h.pulls, 1); assert.equal(h.reloads, 0);
        assert.equal(h.document.querySelector('#local-content-reload-notice'), null);
        h.applied(true); await h.sync(); assert.equal(h.reloads, 0);
        h.edit(''); await h.sync(); assert.equal(h.reloads, 1);
    }
    for (const query of ['cats & dogs', 'example.com/path', 'https://example.com/?q=x']) {
        for (const result of [null, undefined, { closed: true }, {}, { get closed() { throw new Error('unobservable'); } }, new Error('blocked')]) {
            const h = mount(); h.edit(query); h.result(result); await h.submit(); await h.sync();
            assert(h.owned()); assert.equal(h.reloads, 0); assert.equal(h.opens.length, 1, 'no fallback or duplicate navigation');
            assert.equal(h.opens[0].length, 2); assert.equal(h.opens[0][1], '_blank');
            assert.equal(h.input.value, query); assert.equal(h.writes.length, 0);
        }
    }
    for (const query of ['example.com/path', 'https://example.com/?q=x']) {
        const h = mount(); h.edit(query); await h.submit(); await h.sync();
        assert(!h.owned()); assert.equal(h.reloads, 1); assert.equal(h.opens.length, 1);
        assert.equal(h.input.value, query); h.input.dispatch('input'); assert(h.owned());
    }
    {
        const h = mount('custom'); h.edit('missing custom engine'); await h.submit(); await h.sync();
        assert(h.owned()); assert.equal(h.opens.length, 0); assert.equal(h.reloads, 0);
    }
    for (const [engine, custom] of [['google', ''], ['bing', ''], ['duck', ''], ['custom', 'https://example.com/?q=%s']]) {
        const h = mount(engine, custom); h.edit('same query'); await h.submit();
        assert(!h.owned()); assert.equal(h.input.value, 'same query'); await h.sync(); assert.equal(h.reloads, 1);
        await h.submit(); assert(!h.owned()); assert.equal(h.opens.length, 2);
        h.edit('different'); h.edit('same query'); assert(h.owned(), 'editing back to submitted text is a new draft');
        await h.sync(); assert.equal(h.reloads, 1);
        await h.submit(); assert(!h.owned()); h.input.value = 'programmatic draft'; assert(h.owned());
        h.input.value = '=1+2'; await h.submit(); assert(h.owned(), 'calculator success stays owned');
        h.edit('=1/0'); await h.submit(); assert(h.owned(), 'calculator error stays owned');
        h.edit('same query'); await h.submit(); h.result(null); await h.submit(); assert(h.owned(), 'failed resubmit reacquires ownership');
        assert.equal(h.writes.length, 0);
    }
    {
        const h = mount(); h.edit('submitted'); await h.submit(); h.input.dispatch('compositionstart');
        assert(h.owned(), 'a new composition reacquires ownership before a value change');
    }
    for (const event of ['input', 'compositionstart']) {
        const h = mount(); h.edit('same value');
        h.window.open = () => { h.input.dispatch(event); return { closed: false }; };
        await h.submit(); assert(h.owned(), 'an edit during open cannot be marked submitted');
    }
    {
        const h = mount(); h.edit('draft'); await h.sync();
        h.window.localTasksView = { controller: { pending: {} }, hasUncommittedWork: () => false };
        h.allow(); h.document.querySelector('#local-content-reload-notice button').dispatch('click');
        assert.equal(h.confirms, 0); assert.equal(h.reloads, 0, 'other pending owners still block discard');
        h.edit(''); assert(h.owned()); h.window.localTasksView.controller.pending = null;
        assert(!h.owned());
    }
    {
        const h = mount(); h.edit('old draft'); const oldOwner = h.window.localCalculatorView;
        h.context.initializeSearchComponent({});
        assert(!oldOwner.hasUncommittedWork()); assert(!h.owned());
        const current = h.host.querySelector('.search-input'); current.value = 'new draft'; assert(h.owned());
        h.host.remove(); assert(!h.owned(), 'detached inputs cannot block reload');
    }
    console.log('PASS: real search initializer + applied Sync listener; ordinary/URL/Unicode/IME/calculator drafts, blank release, ignored/local changes, cancellation/focus/remount, conservative navigation ownership, repeated edits, no writes and pending-owner preservation');
})().catch(error => { console.error(error); process.exitCode = 1; });
