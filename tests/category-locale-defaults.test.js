const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const { createDocument } = require('./helpers/task-dom-model');
const source = fs.readFileSync('newtab.js', 'utf8');
const catalogs = Object.fromEntries(['en', 'zh_CN'].map(locale =>
    [locale, JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))]));
const ids = ['work', 'social', 'entertainment', 'tools', 'learning'];
const icons = ['💼', '👥', '🎮', '🔧', '📚'];
const names = {
    en: ['Work', 'Social', 'Entertainment', 'Tools', 'Learning'],
    zh_CN: ['工作', '社交', '娱乐', '工具', '学习']
};
const copy = value => JSON.parse(JSON.stringify(value));
const expected = locale => ids.map((id, index) => ({ id, name: names[locale][index], icon: icons[index] }));
const api = (locale, browserLocale = 'fr-FR') => ({
    getMessage: key => catalogs[locale][key]?.message || '',
    getUILanguage: () => browserLocale
});
function fixture(i18n, initial = {}) {
    const state = copy(initial), writes = [];
    global.chrome = { i18n, storage: { local: {
        async get(keys) { return copy(keys === null ? state : Object.fromEntries(keys.filter(key => key in state).map(key => [key, state[key]]))); },
        async set(values) { writes.push(copy(values)); Object.assign(state, copy(values)); },
        async remove(keys) { writes.push({ removed: keys }); for (const key of keys) delete state[key]; }
    } } };
    const manager = new StorageManager();
    manager.ensureSyncInitialized = async () => {};
    manager.withLocalWriteLock = callback => callback();
    return { manager, state, writes };
}
async function navigation(manager, i18n) {
    const document = createDocument();
    const list = document.createElement('div'); list.id = 'category-list'; document.body.append(list);
    const context = { document, window: { addEventListener() {} }, storageManager: manager,
        chrome: { i18n }, localStorage: { getItem: () => 'work' }, console };
    vm.runInNewContext(source + '\nthis.CategoryNavigation = CategoryNavigation;', context);
    const originalInit = context.CategoryNavigation.prototype.init;
    context.CategoryNavigation.prototype.init = function () { return this.ready = originalInit.call(this); };
    const nav = new context.CategoryNavigation();
    await nav.ready;
    return { nav, labels: () => list.children.slice(1).map(item => item.querySelector('.category-name').textContent) };
}
test.afterEach(() => { delete global.chrome; });

for (const locale of ['en', 'zh_CN']) {
    test(`fresh ${locale} categories use the message catalog, retaining IDs, icons and order`, async () => {
        const i18n = api(locale, locale === 'en' ? 'zh-TW' : 'en-US');
        const { manager, state, writes } = fixture(i18n);
        assert.deepEqual(manager.cloneDefaultConfig().categories, expected(locale));
        assert.deepEqual(await manager.get('categories'), expected(locale));
        assert.deepEqual((await manager.getAll()).categories, expected(locale));
        const { nav, labels } = await navigation(manager, i18n);
        assert.deepEqual(copy(nav.categories), expected(locale));
        assert.deepEqual(labels(), names[locale]);
        await nav.init();
        assert.deepEqual(labels(), names[locale]);
        assert.equal(nav.currentCategory, 'work');
        nav.defaultCategories[0].name = 'Temporary edit';
        assert.deepEqual(manager.getDefaultValue('categories'), expected(locale), 'navigation owns a clone');
        assert.deepEqual(state, {});
        assert.deepEqual(writes, [], 'generating or displaying defaults does not migrate storage');
    });
}

test('unsupported French UI uses Chrome’s English catalog fallback', async () => {
    const i18n = api('en', 'fr-FR');
    const { manager, writes } = fixture(i18n);
    assert.deepEqual(manager.getDefaultValue('categories'), expected('en'));
    assert.deepEqual((await navigation(manager, i18n)).labels(), names.en);
    assert.deepEqual(writes, []);
});

test('missing, unusable and throwing category messages fall back to English', () => {
    for (const i18n of [undefined, {}, { getMessage: null }, { getMessage: 7 },
        ...['', '   ', '\n\t', null, undefined, 7, {}, []].map(value => ({ getMessage: () => value })),
        { getMessage: key => key }, { getMessage() { throw new Error('unavailable'); } }]) {
        global.chrome = { i18n };
        assert.deepEqual(new StorageManager().getDefaultValue('categories'), expected('en'));
    }
    delete global.chrome;
    assert.deepEqual(new StorageManager().getDefaultValue('categories'), expected('en'));
});

test('one missing category translation falls back without discarding other translated names', () => {
    global.chrome = { i18n: { getMessage: key => key === 'defaultCategoryTools' ? '' : catalogs.zh_CN[key]?.message || '' } };
    const categories = expected('zh_CN'); categories[3].name = 'Tools';
    assert.deepEqual(new StorageManager().getDefaultValue('categories'), categories);
});

for (const locale of ['en', 'zh_CN']) {
    test(`${locale} reads and backup/import preparation preserve saved names including old defaults`, async () => {
        const savedSets = [expected('zh_CN'), expected('en'), [
            { id: 'custom', name: '工作', icon: '★' },
            { id: 'work', name: 'My projects', icon: '🛠' },
            { id: 'learning', name: '我的书架', icon: '📖' }
        ], []];
        for (const categories of savedSets) {
            const raw = { categories, links: [] };
            const i18n = api(locale);
            const { manager, state, writes } = fixture(i18n, raw);
            assert.deepEqual(await manager.get('categories'), categories);
            assert.deepEqual((await manager.getAll()).categories, categories);
            const { nav, labels } = await navigation(manager, i18n);
            assert.deepEqual(copy(nav.categories), categories);
            assert.deepEqual(labels(), categories.map(category => category.name));
            for (const payload of [raw, { settings: raw }, { version: '1.0', data: raw },
                manager.buildManualExportPayload(raw), manager.buildDriveBackupPayload(raw)]) {
                assert.deepEqual(manager.validateImportPayload(payload).categories, categories);
                assert.deepEqual(manager.prepareRestoredConfig(payload, {}).categories, categories);
            }
            assert.deepEqual(state, raw);
            assert.deepEqual(writes, []);
        }
    });
}

test('explicit reset regenerates localized defaults and retains existing personal-content boundaries', async () => {
    for (const locale of ['en', 'zh_CN']) {
        const personalKey = '__localItabPersonalTasksV1';
        const personal = { sample: 'Existing task data' };
        const { manager, state } = fixture(api(locale), { categories: expected(locale === 'en' ? 'zh_CN' : 'en'), [personalKey]: personal });
        assert.equal(await manager.clear(), true);
        assert.equal(Object.hasOwn(state, 'categories'), false);
        assert.deepEqual(await manager.get('categories'), expected(locale));
        assert.deepEqual(state[personalKey], personal);
        assert.equal(typeof state[manager.layoutGenerationKey], 'string');
        assert.equal(typeof state[manager.settingsGenerationKey], 'string');
    }
});
