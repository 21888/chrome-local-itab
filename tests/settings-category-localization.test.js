const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const StorageManager = require('../storage.js');
const {createDocument, deferred} = require('./helpers/task-dom-model');

// Real i18n, Options initialization, messages, save queue and StorageManager.
// Only DOM/events, timers, serialized Web Locks and Chrome storage/catalogs are
// synthetic. This is not native Chrome, keyboard, IME or screen-reader testing.
const optionsSource = fs.readFileSync('options.js', 'utf8');
const i18nSource = fs.readFileSync('i18n.js', 'utf8');
const lifecycleSource = fs.readFileSync('shared/local-content-lifecycle.js', 'utf8');
const catalogs = Object.fromEntries(['en', 'zh_CN'].map(locale =>
    [locale, JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))]));
const clone = value => JSON.parse(JSON.stringify(value));
const baseline = [
    {id: 'work', name: '工作', icon: '💼'},
    {id: 'learning', name: 'Learning', icon: '📚'},
    {id: 'imported', name: '新分类', icon: '★'},
    {id: 'custom', name: '<b>My $& category 中文</b>', icon: '🛠'}
];
const wording = {
    en: {icon: 'Category icon', name: 'Category name', up: 'Move category up', down: 'Move category down',
        remove: 'Delete category', added: 'New category', saving: 'Saving settings...', saved: 'Settings saved.',
        failed: 'Failed to save settings. Please try again.', prefix: 'Error saving settings:'},
    zh_CN: {icon: '分类图标', name: '分类名称', up: '上移分类', down: '下移分类', remove: '删除分类',
        added: '新分类', saving: '正在保存设置...', saved: '设置已保存。', failed: '保存设置失败，请重试。', prefix: '保存设置时出错：'}
};
function fixture() {
    const state = {...new StorageManager().cloneDefaultConfig(), categories: clone(baseline),
        links: [{title: 'Synthetic work', url: 'https://example.com/work', category: 'work', icon: '🌐'}],
        __localItabPersonalTasksV1: {synthetic: 'private module sentinel'},
        __localItabIdentityRecovery: {synthetic: 'identity recovery sentinel'},
        __localItabRestoreRecovery: {synthetic: 'restore recovery sentinel'}};
    const writes = [], queues = new Map(); let gate = null, writeError = null;
    const locks = {request(name, operation) {
        const result = (queues.get(name) || Promise.resolve()).then(operation);
        queues.set(name, result.catch(() => {})); return result;
    }};
    Object.defineProperty(global, 'navigator', {configurable: true, value: {locks}});
    global.crypto = require('node:crypto').webcrypto;
    const local = {
        async get(keys) { return clone(keys === null ? state : Object.fromEntries(keys.filter(key => key in state).map(key => [key, state[key]]))); },
        async set(values) {
            if (gate) { const pending = gate; gate = null; pending.entered.resolve(); await pending.resume.promise; }
            if (writeError && !writeError.afterCommit) throw writeError;
            writes.push(clone(values)); Object.assign(state, clone(values));
            if (writeError) throw writeError;
        },
        async getBytesInUse() { return JSON.stringify(state).length; }
    };
    async function page({locale = 'en', browserLocale = locale === 'zh_CN' ? 'en-US' : 'zh-CN', api = 'normal', missingKey} = {}) {
        const catalog = catalogs[locale] || catalogs.en;
        const chrome = {storage: {local}, i18n: {
            getMessage(key) {
                if (api === 'throw') throw new Error('Synthetic catalog unavailable');
                if (api === 'missing' || key === missingKey) return '';
                if (api === 'key') return key;
                return catalog[key]?.message || '';
            }, getUILanguage: () => browserLocale
        }};
        if (api === 'absent') delete chrome.i18n;
        global.chrome = chrome;
        const storage = new StorageManager(); storage._syncInitialized = true;
        const document = createDocument(); document.body.prepend = (...nodes) => document.body.append(...nodes);
        for (const [tag, id] of [['ul', 'category-manage-list'], ['button', 'add-category'], ['button', 'save-settings'],
            ['input', 'quote-text'], ['input', 'hour12-format'], ['input', 'show-seconds'], ['input', 'bg-type'],
            ['input', 'bg-color'], ['input', 'bg-color-text'], ['input', 'privacy-online-favicons'], ['div', 'toast-container']]) {
            const node = document.createElement(tag); node.id = id;
            if (tag === 'button') node.type = 'button';
            document.body.append(node);
        }
        const timers = new Map(), windowEvents = new Map(); let timerId = 0, timestamp = 1800000000000, reloads = 0;
        const context = vm.createContext({document, chrome, storageManager: storage, navigator: global.navigator, crypto, URL,
            Date: class extends Date { static now() { return timestamp += 50; } },
            console: {log() {}, warn() {}, error() {}}, confirm: () => false,
            addEventListener(type, fn) { windowEvents.set(type, fn); },
            location: {reload() { reloads++; }},
            setTimeout(fn, delay) { timers.set(++timerId, {fn, delay}); return timerId; },
            clearTimeout(id) { timers.delete(id); }});
        context.window = context;
        if (api !== 'no-helper') vm.runInContext(i18nSource, context);
        vm.runInContext(optionsSource, context);
        await context.initializeOptionsPage(); context.setupEventListeners();
        vm.runInContext(lifecycleSource, context);
        const list = document.getElementById('category-manage-list'), field = id => document.getElementById(id);
        return {context, document, storage, list, timers, field,
            input: (index = 0) => list.children[index].querySelector('.cat-name'),
            messages: () => field('toast-container').children.map(node => ({text: node.textContent,
                type: [...node._classes].find(value => value.startsWith('message-')).slice(8), role: node.getAttribute('role')})),
            save: () => context.saveAllSettings(),
            async autosave() {
                for (const [id, timer] of [...timers]) if (timer.delay === 800) { timers.delete(id); timer.fn(); }
                await vm.runInContext('settingsSaveQueue', context); await Promise.resolve();
            },
            beforeunload() { const event = {prevented: false, preventDefault() { this.prevented = true; }}; windowEvents.get('beforeunload')(event); return event; },
            get reloads() { return reloads; }};
    }
    return {page, writes, state: () => clone(state),
        fail(error) { writeError = error; }, patch(values) { Object.assign(state, clone(values)); },
        pause() { gate = {entered: deferred(), resume: deferred()}; return gate; }};
}
const bounded = (name, fn) => test(name, {timeout: 8000}, fn);
const last = page => page.messages().at(-1);
function assertRow(row, words) {
    assert.equal(row.querySelector('.cat-icon').getAttribute('aria-label'), words.icon);
    assert.equal(row.querySelector('.cat-name').getAttribute('aria-label'), words.name);
    for (const [action, label, glyph] of [['up', words.up, '↑'], ['down', words.down, '↓'], ['delete', words.remove, '✕']]) {
        const button = row.querySelector(`.cat-${action}`);
        assert.equal(button.title, label); assert.equal(button.getAttribute('aria-label'), label);
        assert.equal(button.textContent, glyph); assert.equal(button.type, 'button');
    }
}
function edit(page, text, index = 0) { const input = page.input(index); input.focus(); input.value = text; input.dispatch('input'); return input; }
function protectedDraft(page) {
    assert(page.context.settingsHasUncommittedWork()); assert(page.context.LocalItabContentLifecycle.hasUncommittedWork());
    assert(page.beforeunload().prevented); assert.equal(page.context.LocalItabContentLifecycle.reload(), false); assert.equal(page.reloads, 0);
}
function preservedContent(after, before) {
    for (const key of ['links', 'layout', '__localItabPersonalTasksV1', '__localItabIdentityRecovery', '__localItabRestoreRecovery']) assert.deepEqual(after[key], before[key], key);
}

for (const locale of ['en', 'zh_CN', 'fr-FR']) bounded(`${locale}: actual catalog localizes category controls and Add, then persists only the new name`, async () => {
    const f = fixture(), p = await f.page({locale}), words = wording[locale] || wording.en, before = f.state();
    assert.equal(f.writes.length, 0, 'opening Settings never migrates saved names');
    for (const row of p.list.children) assertRow(row, words);
    assert.deepEqual(p.list.children.map(row => row.querySelector('.cat-name').value), baseline.map(cat => cat.name));
    p.field('add-category').focus(); p.field('add-category').dispatch('click');
    const added = p.list.children.at(-1); assertRow(added, words);
    assert.equal(added.querySelector('.cat-name').value, words.added);
    const expected = [...baseline, {id: added.dataset.id, name: words.added, icon: '📁'}];
    assert.match(added.dataset.id, /^cat_\d+$/); assert.equal(f.writes.length, 0);
    const gate = f.pause(), saving = p.autosave(); await gate.entered.promise;
    assert.deepEqual(last(p), {text: words.saving, type: 'info', role: 'status'}); protectedDraft(p);
    gate.resume.resolve(); await saving;
    assert.deepEqual(f.state().categories, expected); assert.equal(f.writes.length, 1); preservedContent(f.state(), before);
    assert.deepEqual(last(p), {text: words.saved, type: 'success', role: 'status'}); assert(!p.context.settingsHasUncommittedWork());
    const reopened = await f.page({locale: locale === 'zh_CN' ? 'en' : 'zh_CN'});
    assert.deepEqual(reopened.list.children.map(row => row.querySelector('.cat-name').value), expected.map(cat => cat.name));
    assert.equal(f.writes.length, 1, 'changing UI language never rewrites any saved or imported name');
});

for (const api of ['missing', 'throw', 'absent', 'key', 'no-helper']) bounded(`${api}: unavailable messages use readable English controls, new name and save feedback`, async () => {
    const f = fixture(), p = await f.page({locale: 'zh_CN', api});
    assertRow(p.list.children[0], wording.en); p.field('add-category').dispatch('click');
    assert.equal(p.input(4).value, wording.en.added); await p.autosave();
    assert.deepEqual(p.messages().map(message => message.text), [wording.en.saving, wording.en.saved]);
    assert.deepEqual(f.state().categories.slice(0, 4), baseline);
    f.fail(new Error('Synthetic unavailable')); edit(p, 'Retry draft'); await p.save();
    assert.equal(last(p).text, wording.en.failed); protectedDraft(p);
    f.fail(Object.assign(new Error('Exact $& $1 $$ detail\n<b>synthetic</b>'), {code: 'WORKSPACE_TEST_FAILURE'}));
    await p.save(); assert.equal(last(p).text, wording.en.prefix + ' Exact $& $1 $$ detail\n<b>synthetic</b>');
    assert.equal(p.field('toast-container').querySelectorAll('b').length, 0);
});

bounded('one missing message falls back to English without discarding the Chinese catalog', async () => {
    const f = fixture(), p = await f.page({locale: 'zh_CN', missingKey: 'settingsNewCategory'});
    assertRow(p.list.children[0], wording.zh_CN); p.field('add-category').dispatch('click');
    assert.equal(p.input(4).value, wording.en.added); await p.autosave(); assert.equal(last(p).text, wording.zh_CN.saved);
});

for (const locale of ['en', 'zh_CN']) {
    bounded(`${locale}: real Storage false result retains raw draft and gives no success until retry`, async () => {
        const f = fixture(), p = await f.page({locale}), before = f.state();
        const input = edit(p, '  My edited category $& 中文  '); f.fail(new Error('Synthetic ordinary write failure'));
        await p.save(); assert.equal(last(p).text, wording[locale].failed); assert.equal(last(p).role, 'alert');
        assert(!p.messages().some(message => message.type === 'success')); assert.deepEqual(f.state(), before); assert.equal(f.writes.length, 0);
        assert.equal(p.input(), input); assert.equal(input.value, '  My edited category $& 中文  '); protectedDraft(p);
        f.fail(null); await p.save(); assert.equal(last(p).text, wording[locale].saved); assert.equal(f.writes.length, 1);
        assert.equal(f.state().categories[0].name, 'My edited category $& 中文'); assert.equal(input.value, '  My edited category $& 中文  ');
        assert(!p.context.settingsHasUncommittedWork()); preservedContent(f.state(), before);
    });
    bounded(`${locale}: rejection preserves exact details as text and does not claim the write never happened`, async () => {
        const f = fixture(), p = await f.page({locale}), before = f.state();
        const detail = 'Synthetic $& $1 $$ $` $\'\n<img src=x onerror=alert(1)> 中文';
        edit(p, 'Retained draft'); f.fail(Object.assign(new Error(detail), {code: 'WORKSPACE_TEST_FAILURE'}));
        await p.save(); assert.deepEqual(last(p), {text: wording[locale].prefix + ' ' + detail, type: 'error', role: 'alert'});
        assert.equal(p.field('toast-container').querySelectorAll('img').length, 0);
        assert.deepEqual(f.state(), before); assert.equal(f.writes.length, 0); protectedDraft(p);
        assert(!p.messages().some(message => message.type === 'success'));
    });
    bounded(`${locale}: real category conflict retains its full specific reason, raw input and CAS baseline`, async () => {
        const f = fixture(), p = await f.page({locale});
        edit(p, '  Local draft  '); const remote = clone(baseline); remote[0].name = 'Remote saved'; f.patch({categories: remote});
        const before = f.state(); await p.save(); await p.save();
        assert.equal(last(p).text, wording[locale].prefix + ' Categories changed in another tab. Your category edits are still here. Review the latest categories in a new Settings tab before retrying.');
        assert.deepEqual(f.state(), before); assert.equal(f.writes.length, 0); assert.equal(p.input().value, '  Local draft  '); protectedDraft(p);
    });
    bounded(`${locale}: real settings conflict keeps the existing localized notice with no generic prefix`, async () => {
        const f = fixture(), p = await f.page({locale});
        p.field('quote-text').value = 'Local quote'; f.patch({quote: 'Remote quote'}); const before = f.state();
        await p.save(); assert.equal(last(p).text, catalogs[locale].settingsSaveConflict.message);
        assert(!last(p).text.startsWith(wording[locale].prefix)); assert.deepEqual(f.state(), before); assert.equal(f.writes.length, 0); protectedDraft(p);
    });
    bounded(`${locale}: empty name validation stays local and protects the whole draft until corrected`, async () => {
        const f = fixture(), p = await f.page({locale}), before = f.state(); p.field('add-category').dispatch('click');
        const input = edit(p, ' \t ', 4); p.field('quote-text').value = 'Keep entire form draft';
        await p.autosave(); await p.save();
        assert.equal(last(p).text, wording[locale].prefix + ' ' + catalogs[locale].settingsCategoryNameRequired.message);
        assert.deepEqual(f.state(), before); assert.equal(f.writes.length, 0); assert.equal(p.input(4), input); assert.equal(input.value, ' \t '); protectedDraft(p);
        edit(p, 'User chosen 分类', 4); await p.autosave(); assert.equal(f.state().categories[4].name, 'User chosen 分类');
        assert.equal(f.state().quote, 'Keep entire form draft'); assert.equal(last(p).text, wording[locale].saved); assert(!p.context.settingsHasUncommittedWork());
    });
    bounded(`${locale}: older successful localized save cannot clean or replace a newer category draft`, async () => {
        const f = fixture(), p = await f.page({locale}); edit(p, 'Submitted');
        const gate = f.pause(), first = p.save(); await gate.entered.promise;
        const input = edit(p, '  Newer draft  '); gate.resume.resolve(); await first;
        assert.equal(f.state().categories[0].name, 'Submitted'); assert.equal(last(p).text, wording[locale].saved);
        assert.equal(p.input(), input); assert.equal(input.value, '  Newer draft  '); protectedDraft(p);
        await p.autosave(); assert.equal(f.state().categories[0].name, 'Newer draft'); assert.equal(f.writes.length, 2);
        assert.equal(last(p).text, wording[locale].saved); assert(!p.context.settingsHasUncommittedWork());
    });
}

for (const locale of ['en', 'zh_CN']) {
    for (const [kind, key] of [['baseline', 'settingsBaselineUnavailable'], ['lock', 'settingsLockUnavailable'], ['permission', 'settingsPermissionRequired']]) {
        bounded(`${locale}: ${kind} refusal retains its existing specific settings notice`, async () => {
            const f = fixture(), p = await f.page({locale}), before = f.state(); edit(p, 'Local draft');
            if (kind === 'baseline') vm.runInContext('settingsBaseline = null', p.context);
            if (kind === 'lock') Object.defineProperty(global, 'navigator', {configurable: true, value: {}});
            if (kind === 'permission') p.field('privacy-online-favicons').checked = true;
            await p.save(); assert.equal(last(p).text, catalogs[locale][key].message);
            assert.deepEqual(f.state(), before); assert.equal(f.writes.length, 0); protectedDraft(p);
        });
    }
    bounded(`${locale}: real clock conflict keeps its localized detail under the localized prefix`, async () => {
        const f = fixture(), p = await f.page({locale}), clock = f.state().clock; edit(p, 'Category draft held with clock');
        p.field('hour12-format').checked = !clock.hour12; f.patch({clock: {...clock, showSeconds: !clock.showSeconds}});
        const before = f.state(); await p.save();
        assert.equal(last(p).text, wording[locale].prefix + ' ' + catalogs[locale].worldClockConflict.message);
        assert.deepEqual(f.state(), before); assert.equal(f.writes.length, 0); protectedDraft(p);
    });
    bounded(`${locale}: an uncertain error after a local write keeps its detail without promising rollback`, async () => {
        const f = fixture(), p = await f.page({locale}); edit(p, 'Written but unacknowledged');
        const detail = 'Synthetic write acknowledgement unavailable';
        f.fail(Object.assign(new Error(detail), {code: 'WORKSPACE_TEST_FAILURE', afterCommit: true}));
        await p.save(); assert.equal(f.writes.length, 1); assert.equal(f.state().categories[0].name, 'Written but unacknowledged');
        assert.deepEqual(last(p), {text: wording[locale].prefix + ' ' + detail, type: 'error', role: 'alert'});
        assert(!p.messages().some(message => message.type === 'success')); protectedDraft(p);
    });
}

bounded('both catalogs provide identical scoped keys and exact fallback wording', () => {
    const keys = {settingsCategoryIcon: 'icon', settingsCategoryName: 'name', settingsCategoryMoveUp: 'up',
        settingsCategoryMoveDown: 'down', settingsCategoryDelete: 'remove', settingsNewCategory: 'added',
        settingsSaving: 'saving', settingsSaved: 'saved', settingsSaveFailed: 'failed', settingsSaveErrorPrefix: 'prefix'};
    for (const [key, word] of Object.entries(keys)) for (const locale of ['en', 'zh_CN']) {
        assert.equal(catalogs[locale][key]?.message, wording[locale][word], `${locale}/${key}`);
        assert(!catalogs[locale][key].placeholders, 'raw error details never pass through substitution replacement');
    }
});
