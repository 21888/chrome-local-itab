const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const { harness } = require('./focus-timer-helpers');

const catalogs = Object.fromEntries(['en', 'zh_CN'].map(locale => [locale,
    JSON.parse(fs.readFileSync(require.resolve(`../_locales/${locale}/messages.json`), 'utf8'))]));
const expected = {
    en: {
        brief: 'One timer per workspace, shared across its new-tab pages. No sound or background alert.',
        help: 'Each workspace shares one timer across its own new-tab pages. No sound or background alert. Closing or hiding the page keeps the saved deadline; reopening estimates elapsed time using your device clock. Clock changes while closed can affect that estimate. Each interval starts only when you press Start. Settings exports and cloud backups exclude this timer. Removing the extension or browser data can erase it.'
    },
    zh_CN: {
        brief: '每个空间各有一个计时器，同空间的新标签页共享。无声音或后台提醒。',
        help: '每个空间各有一个计时器，同空间的新标签页共享。没有声音或后台提醒。关闭或隐藏页面后会保留结束时间；重新打开时，会按设备时钟估算已经过的时间。页面关闭期间调整时钟可能影响估算。每个时段都需要点击“开始”。设置导出和云端备份不包含计时器。移除扩展或清除浏览器数据可能将其删除。'
    }
};

// Execute the production localization helper and view; only the Chrome catalog,
// local timer backend and DOM are synthetic. No browser or external service runs.
function model(locale, mode = 'normal') {
    const document = createDocument(), h = harness(), effects = [];
    const api = { ...require('../shared/local-focus-store'), ...require('../shared/local-focus-controller') };
    h.state = { ...api.initial(), enabled: true };
    const blocked = effect => () => { effects.push(effect); throw Error(`Unexpected ${effect}`); };
    const chrome = {
        i18n: { getMessage(key) {
            if (mode === 'throw') throw Error('Synthetic unavailable catalog');
            return mode === 'missing' ? '' : catalogs[locale][key]?.message || '';
        } },
        storage: new Proxy({}, { get: blocked('browser storage') }),
        permissions: { request: blocked('permission request') },
        runtime: { sendMessage: blocked('background request') }
    };
    if (mode === 'absent') delete chrome.i18n;
    const context = { document, chrome, LocalItabFocus: api,
        fetch: blocked('network request'), XMLHttpRequest: blocked('network request'), WebSocket: blocked('network request'),
        navigator: { sendBeacon: blocked('network request') },
        localStorage: new Proxy({}, { get: blocked('browser storage') }),
        setTimeout: blocked('timer scheduling'), clearTimeout() {} };
    context.window = context; vm.createContext(context);
    if (mode !== 'no-helper') vm.runInContext(fs.readFileSync(require.resolve('../i18n'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(require.resolve('../shared/local-focus-view'), 'utf8'), context);
    const card = document.createElement('article'), settingsHost = document.createElement('section');
    document.body.append(card, settingsHost);
    const view = new api.View(card, { controller: h.controller() });
    const settings = api.mountSettings(settingsHost, { controller: h.controller() });
    return { document, h, effects, card, settingsHost, view, settings };
}

for (const [locale, mode] of [['en', 'normal'], ['zh_CN', 'normal'],
    ...['missing', 'throw', 'absent', 'no-helper'].map(mode => ['zh_CN', mode])]) {
    test(`${locale}/${mode}: rendered brief, expanded help and settings describe workspace-scoped timing without side effects`, async () => {
        const m = model(locale, mode), text = expected[mode === 'normal' ? locale : 'en'];
        try {
            const before = m.h.state;
            await m.h.flush();
            assert.equal(m.card.hidden, false);
            assert.equal(m.card.querySelector('.focus-help').textContent, text.brief);
            const details = m.card.querySelector('details'), help = details.querySelector('p');
            assert.equal(details.open, false);
            assert.equal(help.getClientRects().length, 0);
            assert.equal(details.querySelector('summary').textContent, catalogs[mode === 'normal' ? locale : 'en'].focusDetails.message);
            assert.equal(m.settingsHost.querySelectorAll('.focus-help')[1].textContent, text.help);
            assert(m.settingsHost.querySelectorAll('.focus-help')[1].getClientRects().length);
            for (const open of [true, false, true]) {
                details.open = open; details.dispatch('toggle');
                m.view.render(); await m.h.flush();
                assert.equal(details.open, open);
                assert.equal(Boolean(help.getClientRects().length), open);
                assert.equal(help.textContent, text.help, 'retain all timing, backup and data-loss notices');
            }
            assert.equal(m.h.writes, 0, 'mounting and disclosure are presentation-only');
            assert.deepEqual(m.h.state, before);
            assert.deepEqual(m.effects, [], 'no network, permission, background or direct browser-storage requests');
        } finally { m.settings.destroy(); m.view.destroy(); }
    });
}
