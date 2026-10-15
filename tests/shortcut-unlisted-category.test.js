'use strict';
// Synthetic memory-only storage + production Settings, More/Edit and save paths.
// Model native select unmatched values explicitly; native browser QA is separate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Storage = require('../storage');
const Workspaces = require('../shared/workspaces');
const { createDocument } = require('./helpers/task-dom-model');
const { createHarness, menuAction, submit, deferred } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));
const id = n => 'l_' + String(n).padStart(32, '0');
const messages = Object.fromEntries(['en', 'zh_CN'].map(locale =>
    [locale, JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))]));
const targetURL = 'https://example.com'; // Preserve supported historical spelling.
const field = (h, name) => h.component.modal.querySelector(`#shortcut-${name}`);

function fixture(schema = 1, category = 'research') {
    const raw = new Storage().cloneDefaultConfig();
    raw.schemaVersion = schema;
    raw.categories = [{ id: 'work', name: 'Work', icon: 'W' },
        { id: 'research', name: 'Research', icon: 'R' }, { id: 'personal', name: 'Personal', icon: 'P' }];
    raw.links = [
        { title: 'Synthetic research note', url: targetURL, icon: 'T', category },
        { title: 'Synthetic neighbour', url: 'https://example.com/neighbour', icon: 'N', category: 'work' },
        { title: 'Synthetic hidden note', url: 'https://example.com/hidden', icon: 'H', category: 'hidden' }
    ];
    raw.layout = { ...raw.layout, autoArrange: false, positions: {
        [`all|${targetURL}`]: { x: 11.25, y: 27 }, [`${category}|${targetURL}`]: { x: 37, y: 49.5 },
        [`hidden|${targetURL}`]: { x: -8.5, y: 72 },
        'hidden|https://example.com/hidden': { x: 42, y: -83.5 }
    } };
    if (schema === 2) {
        raw.links.forEach((link, index) => { link.layoutId = id(index + 1); });
        raw.layout.identityVersion = 1;
        raw.layout.positionsById = {
            [id(1)]: { all: { x: 11, y: 22 }, [category]: { x: 33, y: 44 }, hidden: { x: -17, y: 99 } },
            [id(2)]: { all: { x: 100, y: 150 } }, [id(3)]: { hidden: { x: 42, y: -83.5 } },
            [id(9)]: { reserved: { x: 65, y: 75 } }
        };
    }
    raw.quote = 'Synthetic unrelated content';
    raw.__localItabIdentityRecovery = { synthetic: 'existing original copy', payload: { links: clone(raw.links) } };
    raw.__localItabRestoreRecovery = { synthetic: 'existing restore copy', previousRecovery: { synthetic: 'prior copy' } };
    return raw;
}
function backend(initial) {
    const state = clone(initial), writes = [], attempts = [], queues = new Map();
    let gate = null;
    const local = {
        async get(keys) { return clone(keys === null ? state : Object.fromEntries(
            (typeof keys === 'string' ? [keys] : keys).filter(key => key in state).map(key => [key, state[key]]))); },
        async set(values) { if (gate) { gate.entered.resolve(); await gate.resume.promise; }
            writes.push(clone(values)); Object.assign(state, clone(values)); },
        async remove() { assert.fail('unexpected removal'); }
    };
    global.chrome = { storage: { local } };
    Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: {
        request(name, options, action) { const next = (queues.get(name) || Promise.resolve()).then(action || options);
            queues.set(name, next.catch(() => {})); return next; }
    } } });
    Object.defineProperty(global, 'crypto', { configurable: true, value: require('node:crypto').webcrypto });
    const storage = new Storage(); storage._syncInitialized = true;
    storage.scheduleSyncPush = () => assert.fail('no sync request expected');
    return { state, writes, attempts, storage, get gate() { return gate; }, set gate(value) { gate = value; } };
}
function editor(b, locale) {
    const h = createHarness(b.state.links);
    const nav = h.context.window.categoryNavigation;
    nav.categories = clone(b.state.categories); nav.currentCategory = 'all';
    h.component.categories = clone(b.state.categories); h.component.layout = clone(b.state.layout);
    h.component.positions = clone(b.state.layout.positions); h.component.updateGrid();
    if (locale) h.context.i18n = h.context.window.i18n = { t: key => messages[locale][key]?.message || '' };
    const select = field(h, 'category'); let selected = null;
    Object.defineProperty(select, 'value', { configurable: true,
        get() { return selected === null ? (select.children[0]?.value || '') : selected; },
        set(value) { selected = select.children.some(option => option.value === String(value)) ? String(value) : ''; }
    });
    const replaceChildren = select.replaceChildren.bind(select);
    select.replaceChildren = (...children) => { replaceChildren(...children); selected = null; };
    h.storageManager.set = (key, next, options) => {
        b.attempts.push({ key, next: clone(next), options: clone(options) });
        return b.storage.set(key, clone(next), clone(options));
    };
    return h;
}
async function deleteCategoryThroughSettings(b) {
    const document = createDocument(), list = document.createElement('ul'), add = document.createElement('button');
    list.id = 'category-manage-list'; add.id = 'add-category'; document.body.append(list, add);
    const feedback = [];
    const context = { document, window: { addEventListener() {} }, chrome: global.chrome,
        navigator: global.navigator, crypto: global.crypto, storageManager: b.storage, URL,
        console: { log() {}, error() {}, warn() {} }, setTimeout() {}, clearTimeout() {}, feedback };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('options.js', 'utf8') +
        '\nshowMessage = (text, type) => feedback.push({text, type}); displayStorageInfo = async () => {};', context);
    context.setupCategoryManagement(clone(b.state.categories)); context.initialConfig = clone(b.state);
    vm.runInContext('clockBaseline = copyClock(initialConfig.clock); clockFormInitialized = true;' +
        'settingsFormConfig = initialConfig; settingsBaseline = storageManager.settingsSnapshot(initialConfig);' +
        'settingsFormBaseline = collectFormData();', context);
    const before = clone(b.state);
    list.children.find(row => row.dataset.id === 'research').querySelector('.cat-delete').dispatch('click');
    await context.saveAllSettings();
    assert.equal(feedback.at(-1).text, 'Settings saved.');
    assert.deepEqual(b.state.categories.map(cat => cat.id), ['work', 'personal']);
    assert.deepEqual(b.state.links, before.links); assert.deepEqual(b.state.layout, before.layout);
}
function assertOnlyTitleChanged(b, before, title = 'Edited title only') {
    const expected = clone(before); expected.links[0].title = title;
    assert.deepEqual(b.state, expected, 'raw URL, other records, metadata, all coordinates and recovery copies remain exact');
    assert.deepEqual(Object.keys(b.writes.at(-1)), ['links']);
    assert.deepEqual(b.attempts.at(-1).options.expectedLinks, before.links);
    assert.deepEqual(b.attempts.at(-1).options.operation, { type: 'edit', index: 0 });
}
test.afterEach(() => { delete global.chrome; delete global.navigator; delete global.crypto; });

for (const schema of [1, 2]) for (const locale of ['en', 'zh_CN']) {
    test(`schema ${schema}/${locale}: Settings deletion then More/Edit title-only save retains the exact absent category`, async () => {
        const b = backend(fixture(schema)); await deleteCategoryThroughSettings(b);
        const before = clone(b.state), writes = b.writes.length, h = editor(b, locale);
        menuAction(h, 0, 'edit');
        assert.equal(field(h, 'category').value, 'research');
        assert.equal(field(h, 'category').children.at(-1).textContent,
            `research (${messages[locale].shortcutCategoryUnlisted.message})`);
        assert.equal(h.component.hasUncommittedShortcutWork(), false);
        assert.equal(b.writes.length, writes); assert.deepEqual(b.state, before);
        field(h, 'title').value = 'Discard this draft'; h.document.activeElement.dispatch('keydown', { key: 'Escape' });
        assert.equal(h.document.activeElement, h.control(0, 'more'));
        assert.equal(h.component.hasUncommittedShortcutWork(), false); assert.deepEqual(b.state, before);
        menuAction(h, 0, 'edit'); field(h, 'title').value = 'Edited title only'; await submit(h.component);
        assert.equal(b.writes.length, writes + 1); assertOnlyTitleChanged(b, before);
        assert.equal(h.document.activeElement, h.control(0, 'more'));
        assert.equal(h.component.modal.classList.contains('active'), false);
    });
}
for (const category of [' research ', ' ', '\t\n', '研究\u00a0分类', '__proto__', '<img src=x onerror=alert(1)>']) {
    test(`unlisted category is preserved byte-for-byte and displayed as text: ${JSON.stringify(category)}`, async () => {
        for (const schema of [1, 2]) {
            const b = backend(fixture(schema, category)), before = clone(b.state), h = editor(b);
            menuAction(h, 0, 'edit');
            const option = field(h, 'category').children.at(-1);
            assert.equal(option.value, category); assert.equal(option.textContent, `${category} (Not in category list)`);
            assert.equal(option.children.length, 0); assert.equal(field(h, 'category').value, category);
            field(h, 'title').value = 'Edited title only'; await submit(h.component); assertOnlyTitleChanged(b, before);
        }
    });
}

test('a listed exact category has no duplicate option; changing away and back retains its original ID', async () => {
    const b = backend(fixture(2, ' 研究 ')); b.state.categories.push({ id: ' 研究 ', name: 'Research', icon: 'R' });
    const before = clone(b.state), h = editor(b, 'zh_CN'); menuAction(h, 0, 'edit');
    assert.equal(field(h, 'category').children.length, b.state.categories.length);
    field(h, 'category').value = 'personal'; field(h, 'category').value = ' 研究 ';
    field(h, 'title').value = 'Edited title only'; await submit(h.component); assertOnlyTitleChanged(b, before);
});

test('explicit category choice wins; cancel/reopen/add never leaks an unlisted option or creates metadata', async () => {
    const b = backend(fixture(1, 'old-category')), h = editor(b), before = clone(b.state);
    menuAction(h, 0, 'edit'); field(h, 'category').value = 'personal'; await submit(h.component);
    const expected = clone(before); expected.links[0].category = 'personal'; assert.deepEqual(b.state, expected);
    menuAction(h, 0, 'edit'); assert.equal(field(h, 'category').value, 'personal');
    assert.equal(field(h, 'category').children.some(option => option.value === 'old-category'), false);
    h.component.hideModal();
    for (const current of ['all', 'personal']) {
        h.context.window.categoryNavigation.currentCategory = current; h.component.openAddModal();
        assert.equal(field(h, 'category').value, current === 'all' ? 'work' : 'personal');
        assert.equal(field(h, 'category').children.length, before.categories.length); h.component.hideModal();
    }
    assert.deepEqual(b.state.categories, before.categories); assert.equal(b.writes.length, 1);
});

test('explicitly selected listed IDs are exact for edits and new shortcuts; unmatched select values keep the work fallback', async () => {
    for (const schema of [1, 2]) for (const mode of ['edit', 'add']) for (const target of [' personal ', '\t研究\n', ' ', '__proto__']) {
        const b = backend(fixture(schema, 'old-unlisted'));
        b.state.categories.push({ id: target, name: 'Exact target', icon: 'E' });
        const before = clone(b.state), h = editor(b);
        if (mode === 'edit') menuAction(h, 0, 'edit'); else h.component.openAddModal();
        field(h, 'category').value = ' arbitrary injected value ';
        assert.equal(field(h, 'category').value, '', 'native unmatched values are not accepted options');
        assert.equal(h.component.normalizedShortcutDraft().category, 'work');
        field(h, 'category').value = target;
        assert.equal(h.component.normalizedShortcutDraft().category, target);
        if (mode === 'add') { field(h, 'title').value = 'Synthetic new link'; field(h, 'url').value = 'https://example.com/new'; }
        await submit(h.component);
        const expected = clone(before);
        if (mode === 'edit') expected.links[0].category = target;
        else expected.links.push({ title: 'Synthetic new link', url: 'https://example.com/new', icon: '🌐', category: target });
        assert.deepEqual(b.state, expected); assert.equal(b.writes.length, 1);
    }
});

test('empty or not-yet-loaded categories keep only the current edit ID; add defaults stay unchanged', async () => {
    const b = backend(fixture(1, 'saved-unlisted')), h = editor(b);
    h.context.window.categoryNavigation.categories = [];
    menuAction(h, 0, 'edit'); assert.equal(field(h, 'category').children.length, 1);
    assert.equal(field(h, 'category').value, 'saved-unlisted'); h.component.hideModal();
    h.component.openAddModal(); assert.equal(field(h, 'category').children.length, 0);
    assert.equal(h.component.normalizedShortcutDraft().category, 'work'); h.component.hideModal();
    h.context.window.categoryNavigation.categories = [{ id: 'saved-unlisted', name: 'Loaded later', icon: 'L' }];
    menuAction(h, 0, 'edit'); assert.equal(field(h, 'category').children.length, 1);
    assert.equal(field(h, 'category').children[0].textContent, 'L Loaded later');
    assert.equal(b.writes.length, 0);
});

test('category metadata changing during an open or pending editor is not overwritten or recreated', async () => {
    for (const pending of [false, true]) {
        const b = backend(fixture(2)), h = editor(b); menuAction(h, 0, 'edit');
        field(h, 'title').value = 'Edited title only';
        let saving;
        if (pending) { b.gate = { entered: deferred(), resume: deferred() }; saving = submit(h.component); await b.gate.entered.promise; }
        b.state.categories = [{ id: 'work', name: 'Changed elsewhere', icon: 'W' }];
        h.context.window.categoryNavigation.categories = clone(b.state.categories);
        const before = clone(b.state);
        if (pending) { h.component.hideModal(); h.search.focus(); b.gate.resume.resolve(); await saving;
            assert.equal(h.document.activeElement, h.search); }
        else await submit(h.component);
        assertOnlyTitleChanged(b, before);
        menuAction(h, 0, 'edit'); assert.equal(field(h, 'category').value, 'research');
        assert.equal(field(h, 'category').children.at(-1).textContent, 'research (Not in category list)');
    }
});

for (const schema of [1, 2]) test(`schema ${schema}: active workspace saves retain unlisted and explicitly selected exact IDs`, async () => {
    const initial = fixture(schema, ' research '); initial.categories = [{ id: 'work', name: 'Work', icon: 'W' },
        { id: ' personal ', name: 'Personal', icon: 'P' }];
    const b = backend(initial); let serial = 0;
    const manager = Workspaces.createManager({ chrome: global.chrome, locks: global.navigator.locks,
        now: () => '2026-10-15T00:00:00.000Z', id: () => `synthetic_valid_${++serial}` });
    const workspace = manager.capture(); b.storage = new Storage({ workspace }); b.storage._syncInitialized = true;
    await workspace.ready();
    const before = clone(await workspace.local.get(null)); const h = editor(b);
    menuAction(h, 0, 'edit'); field(h, 'title').value = 'Active workspace edit'; await submit(h.component);
    const expected = clone(before); expected.links[0].title = 'Active workspace edit';
    assert.deepEqual(await workspace.local.get(null), expected);
    menuAction(h, 0, 'edit'); field(h, 'category').value = ' personal '; await submit(h.component);
    expected.links[0].category = ' personal '; assert.deepEqual(await workspace.local.get(null), expected);
    assert.deepEqual(b.state.links, initial.links, 'migration source remains exact');
    assert.deepEqual(b.state[Workspaces.SNAPSHOT_KEY].values, initial, 'pre-migration recovery remains exact');
});

for (const category of [undefined, '', null, false, 0, 42, {}, []]) {
    test(`non-string/empty categories receive no new option and keep their existing validation boundary: ${JSON.stringify(category)}`, async () => {
        const initial = fixture(1); if (category === undefined) delete initial.links[0].category; else initial.links[0].category = category;
        const b = backend(initial), h = editor(b); menuAction(h, 0, 'edit');
        assert.equal(field(h, 'category').children.length, initial.categories.length);
        assert.equal(h.component.normalizedShortcutDraft().category, 'work', 'the legacy display fallback is unchanged');
        h.component.hideModal(); assert.deepEqual(b.state, initial); assert.equal(b.writes.length, 0);
        if (category === undefined) {
            assert.doesNotThrow(() => b.storage.validateWorkspaceConfig(initial), 'missing category keeps the documented legacy default');
        } else {
            assert.throws(() => b.storage.validateWorkspaceConfig(initial), 'an explicit empty or non-string value is not a valid active workspace');
            let serial = 0;
            const manager = Workspaces.createManager({ chrome: global.chrome, locks: global.navigator.locks,
                now: () => '2026-10-15T00:00:00.000Z', id: () => `synthetic_category_${++serial}` });
            const workspace = manager.capture(), storage = new Storage({ workspace }); storage._syncInitialized = true;
            await assert.rejects(workspace.ready(), error => error.code === 'WORKSPACE_CORRUPT');
            const next = clone(initial.links); next[0] = { ...next[0], title: 'Must not repair corrupt workspace', category: 'work' };
            await assert.rejects(storage.set('links', next, { expectedLinks: initial.links, operation: { type: 'edit', index: 0 } }),
                error => error.code === 'WORKSPACE_CORRUPT');
            assert.deepEqual(b.state, initial); assert.equal(b.writes.length, 0, 'the original invalid active data cannot be rewritten by the editor');
        }
        if (category !== undefined && category !== '') assert.throws(() => b.storage.validateImportPayload(initial), /category/i);
        else assert.equal(b.storage.validateImportPayload(initial).links[0].category, 'work', 'import normalization remains its separate existing boundary');
    });
}

for (const corruption of ['unknown-legacy-field', 'unsupported-url', 'invalid-layout-id']) {
    test(`unlisted category does not launder rejected original records: ${corruption}`, async () => {
        const initial = fixture(2, 'unlisted');
        if (corruption === 'unknown-legacy-field') initial.links[0].unknown = { synthetic: 'retain for validation' };
        if (corruption === 'unsupported-url') initial.links[0].url = 'javascript:alert(1)';
        if (corruption === 'invalid-layout-id') initial.links[0].layoutId = 'invalid';
        const b = backend(initial), h = editor(b); h.component.openEditModal(0);
        field(h, 'title').value = 'Must not save'; await submit(h.component);
        assert.deepEqual(b.state, initial); assert.equal(b.writes.length, 0);
        assert.equal(h.component.modal.classList.contains('active'), true);
        assert.ok(h.component.modal.querySelector('#url-error').textContent);
        if (b.attempts.length) {
            assert.deepEqual(b.attempts[0].options.expectedLinks, initial.links);
            assert.deepEqual(b.attempts[0].next[0], { ...initial.links[0], title: 'Must not save' });
        }
    });
}
