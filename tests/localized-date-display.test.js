const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const source = fs.readFileSync('newtab.js', 'utf8');
const helper = fs.readFileSync('i18n.js', 'utf8');
const catalogs = Object.fromEntries(['en', 'zh_CN'].map(locale => [locale,
    JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))]));

// Load the actual helper and emulate Chrome's positional $1 substitutions.
function clock(locale, { loadHelper = true, messageMode = 'catalog' } = {}) {
    const calls = [];
    const context = {
        document: createDocument(), window: { addEventListener() {} },
        navigator: { language: 'en-US' }, console,
        chrome: { i18n: {
            getUILanguage: () => locale === 'zh_CN' ? 'en-US' : 'en-GB',
            getMessage(key, substitutions = []) {
                calls.push([key, Array.from(substitutions)]);
                if (messageMode === 'empty') return '';
                if (messageMode === 'echo') return key;
                if (messageMode === 'throw') throw new Error('Unavailable');
                if (key === '@@ui_locale') return 'en_US';
                return (catalogs[locale]?.[key]?.message || '').replace(/\$(\d+)/g,
                    (_, number) => substitutions[Number(number) - 1] ?? '');
            }
        } }
    };
    vm.createContext(context);
    if (loadHelper) {
        vm.runInContext(helper, context);
        context.i18n = context.window.i18n;
    }
    vm.runInContext(source + '\nthis.ClockComponent = ClockComponent;', context);
    return { component: new context.ClockComponent({ hour12: false, showSeconds: true }), calls };
}

test('shipped catalogs render exact complete CN and EN dates with string substitutions', () => {
    for (const [locale, expected] of [
        ['zh_CN', '2026年10月9日星期五 • 第282天 • 第41周'],
        ['en', 'Friday, October 9, 2026 • Day 282 • Week 41']
    ]) {
        const { component, calls } = clock(locale);
        assert.equal(component.formatDate(new Date(2026, 9, 9, 12)), expected);
        assert.deepEqual(calls.filter(([key]) => ['dayOfYear', 'weekNumber'].includes(key)),
            [['dayOfYear', ['282']], ['weekNumber', ['41']]]);
    }
});

test('missing helper retains complete English counter fallbacks with the catalog date', () => {
    const { component } = clock('zh_CN', { loadHelper: false });
    assert.equal(component.formatDate(new Date(2026, 9, 9, 12)),
        '2026年10月9日星期五 • Day 282 • Week 41');
});

test('empty, key-echo and unavailable messages use complete fallbacks and natural GB order', () => {
    for (const messageMode of ['empty', 'echo', 'throw']) {
        const { component } = clock('en', { messageMode });
        assert.equal(component.formatDate(new Date(2026, 9, 9, 12)),
            'Friday, 9 October 2026 • Day 282 • Week 41');
    }
});

test('localized counters retain leap-day and ISO year-boundary facts without mutation', () => {
    const cases = [
        [2024, 2, 29, 60, 9], [2024, 12, 31, 366, 1],
        [2021, 1, 1, 1, 53], [2026, 1, 1, 1, 1], [2026, 12, 31, 365, 53]
    ];
    for (const locale of ['en', 'zh_CN']) {
        const { component } = clock(locale);
        const config = { ...component.config };
        for (const [year, month, day, ordinal, week] of cases) {
            const date = new Date(year, month - 1, day, 12);
            const stamp = date.getTime();
            const dateText = date.toLocaleDateString(locale === 'en' ? 'en' : 'zh-CN', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            const counters = locale === 'en' ? `Day ${ordinal} • Week ${week}` : `第${ordinal}天 • 第${week}周`;
            const expected = `${dateText} • ${counters}`;
            assert.equal(component.formatDate(date), expected);
            assert.equal(component.formatDate(date), expected);
            assert.equal(date.getTime(), stamp);
            assert.deepEqual(component.config, config);
        }
    }
});
