const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const { createDocument } = require('./helpers/task-dom-model');
const source = fs.readFileSync('newtab.js', 'utf8');
const english = 'Welcome to your personalized new tab page!';
const chinese = '欢迎来到你的个性化新标签页！';
const catalogs = Object.fromEntries(['en', 'zh_CN'].map(locale => [locale, JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))]));
function clock(i18n, language = 'en-US', omitChrome = false) {
    const context = { document: createDocument(), window: { addEventListener() {} }, navigator: { language }, console };
    if (!omitChrome) context.chrome = { i18n };
    vm.createContext(context);
    vm.runInContext(source + '\nthis.ClockComponent = ClockComponent;', context);
    return new context.ClockComponent({ hour12: false, showSeconds: true });
}

test('date follows extension UI locale before browser preference and safely falls back', () => {
    assert.equal(clock({ getUILanguage: () => 'zh-CN' }).getDateLocale(), 'zh-CN');
    assert.equal(clock({ getUILanguage: () => 'en-GB' }, 'zh-CN').getDateLocale(), 'en-GB');
    for (const i18n of [undefined, {}, { getUILanguage() { throw new Error('unavailable'); } }, { getUILanguage: () => 'bad_locale' }, { getUILanguage: () => '' }, { getUILanguage: () => ({}) }]) {
        assert.equal(clock(i18n, 'en-GB').getDateLocale(), 'en-GB');
    }
    assert.equal(clock(undefined, 'en-GB', true).getDateLocale(), 'en-GB');
    const missing = clock(undefined, null, true);
    assert.equal(missing.getDateLocale(), undefined);
    const invalid = clock({ getUILanguage: () => 'bad_locale' }, 'also_invalid');
    assert.equal(invalid.getDateLocale(), undefined);
    assert.doesNotThrow(() => invalid.formatDate(new Date(2026, 9, 9, 12)));
});

test('extension message locale wins when native browser UI and content locales differ', () => {
    const component = clock({
        getMessage: key => key === '@@ui_locale' ? 'zh_CN' : '',
        getUILanguage: () => 'en-US'
    }, 'en-US');
    assert.equal(component.getDateLocale(), 'zh-CN');
    const date = new Date(2026, 9, 9, 12);
    assert.ok(component.formatDate(date).startsWith(date.toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })));
    for (const getMessage of [() => '', () => '@@ui_locale', () => null, () => 'invalid_locale_tag_!', () => { throw new Error('unavailable'); }]) {
        assert.equal(clock({ getMessage, getUILanguage: () => 'en-GB' }).getDateLocale(), 'en-GB');
    }
    assert.equal(clock({ getMessage: () => 'en', getUILanguage: () => 'zh-CN' }, 'zh-CN').getDateLocale(), 'en');
});

test('explicit catalog locale aligns dates when both native locale indicators remain English', () => {
    for (const [catalog, expected] of [['zh_CN', 'zh-CN'], ['en', 'en']]) {
        const component = clock({
            getMessage: key => key === '@@ui_locale' ? 'en_US' : catalogs[catalog][key]?.message || '',
            getUILanguage: () => 'en-US'
        }, 'en-US');
        assert.equal(component.getDateLocale(), expected);
        const date = new Date(2026, 9, 9, 12);
        assert.ok(component.formatDate(date).startsWith(date.toLocaleDateString(expected, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })));
    }
    for (const value of ['', 'dateFormattingLocale', null, 'bad_locale', 42]) {
        assert.equal(clock({ getMessage: key => key === 'dateFormattingLocale' ? value : 'zh_CN', getUILanguage: () => 'en-US' }).getDateLocale(), 'zh-CN');
    }
});

test('calendar calculations, repeated date display and clock options stay stable', () => {
    const cn = clock({ getUILanguage: () => 'zh-CN' });
    const en = clock({ getUILanguage: () => 'en-US' });
    for (const date of [new Date(2026, 9, 9, 12), new Date(2024, 1, 29, 12), new Date(2026, 0, 1, 12), new Date(2026, 11, 31, 12)]) {
        const stamp = date.getTime();
        const expected = `${date.toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} • Day ${en.getDayOfYear(date)} • Week ${en.getWeekNumber(date)}`;
        assert.equal(cn.formatDate(date), expected);
        assert.equal(cn.formatDate(date), expected);
        assert.equal(date.getTime(), stamp);
        for (const hour12 of [false, true]) for (const showSeconds of [false, true]) {
            cn.config = { hour12, showSeconds };
            const options = { hour: '2-digit', minute: '2-digit', hour12 };
            if (showSeconds) options.second = '2-digit';
            assert.equal(cn.formatTime(date), date.toLocaleTimeString('en-US', options));
        }
    }
});

test('new welcome defaults localize with robust missing API/message fallback', () => {
    try {
        for (const [locale, expected] of [['en', english], ['zh_CN', chinese]]) {
            global.chrome = { i18n: { getMessage: key => catalogs[locale][key]?.message } };
            assert.equal(new StorageManager().cloneDefaultConfig().quote, expected);
        }
        for (const i18n of [undefined, {}, { getMessage: () => '' }, { getMessage: () => null }, { getMessage: () => 7 }, { getMessage() { throw new Error('unavailable'); } }]) {
            global.chrome = { i18n };
            assert.equal(new StorageManager().defaultConfig.quote, english);
        }
        delete global.chrome;
        assert.equal(new StorageManager().defaultConfig.quote, english);
    } finally { delete global.chrome; }
});

test('saved/imported custom and old English quotes remain unchanged without migration writes', async () => {
    let raw = {}, writes = 0;
    global.chrome = { i18n: { getMessage: key => catalogs.zh_CN[key]?.message }, storage: { local: {
        get: async () => ({ ...raw }), set: async () => { writes++; }
    } } };
    try {
        const manager = new StorageManager();
        manager.ensureSyncInitialized = async () => {};
        manager.withLocalWriteLock = callback => callback();
        for (const quote of [english, 'My intentional English quote', '自定义语句', '$date{YYYY-MM-DD} • My day']) {
            raw = { quote, links: [] };
            assert.equal((await manager.getAll()).quote, quote);
            for (const payload of [raw, { settings: raw }, { version: '1.0', data: raw }, manager.buildManualExportPayload(raw), manager.buildDriveBackupPayload(raw)]) {
                assert.equal(manager.validateImportPayload(payload).quote, quote);
                assert.equal(manager.prepareRestoredConfig(payload, {}).quote, quote);
            }
            assert.equal(raw.quote, quote);
        }
        // Retain pre-existing normalization; localization must not introduce a migration.
        assert.equal(manager.validateConfigObject({ quote: '  custom  ' }).quote, 'custom');
        assert.equal(manager.validateConfigObject({ quote: '' }).quote, english);
        assert.equal(manager.validateConfigObject({ quote: '  ' }).quote, english);
        raw = { links: [] };
        assert.equal((await manager.getAll()).quote, chinese);
        assert.equal(manager.validateImportPayload(raw).quote, chinese);
        assert.equal(writes, 0);
    } finally { delete global.chrome; }
});
