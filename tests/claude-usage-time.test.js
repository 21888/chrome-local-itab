const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const html = fs.readFileSync('claude-usage-experiment.html', 'utf8');
const A = '11111111-1111-1111-1111-111111111111';
const event = () => ({ addListener() {}, removeListener() {} });
const defaultTime = '2026-03-08T09:59:59Z';
// Actual page, localization, validator, controller and renderer. Only the device
// clock/time zone and Chrome transport are synthetic; no provider is contacted.
function page(locale = 'en', zone = 'UTC', { brokenIntl = false, reset = defaultTime } = {}) {
    const document = createDocument({ aggregateTextContent: true }), calls = [], formats = [];
    document.documentElement.lang = 'en';
    for (const match of html.matchAll(/<(title|h1|p|button|a|section)\b([^>]*)>([^<]*)<\/\1>/g)) {
        const node = document.createElement(match[1]); node.textContent = match[3];
        for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
            node.setAttribute(attr[1], attr[2]);
            if (attr[1] === 'id') node.id = attr[2];
            if (attr[1].startsWith('data-')) node.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attr[2];
        }
        document.body.append(node);
    }
    const blocked = () => { throw Error('Unexpected network, storage, identity, permission or timer use'); };
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
    const chrome = {
        i18n: { getMessage: key => catalog[key]?.message || '', getUILanguage: blocked },
        permissions: { request: async () => { calls.push('permission'); return true; }, contains: async () => true, onRemoved: event() },
        tabs: { query: async () => [{ id: 7, url: 'https://claude.ai/' }], get: async id => ({ id, url: 'https://claude.ai/' }), onUpdated: event(), onRemoved: event() },
        scripting: { executeScript: async request => { calls.push([...request.args]); return [{ frameId: 0, documentId: 'synthetic', result: request.args[0] === 'organizations' ? { organizations: [{ id: A, name: 'Synthetic' }] } : { windows: { five_hour: { usedPercent: 0, resetAt: reset }, seven_day: null } } }]; } },
        storage: new Proxy({}, { get: blocked }), identity: new Proxy({}, { get: blocked })
    };
    class DeviceDate extends Date { constructor(...args) { super(...(args.length ? args : [defaultTime])); } }
    const context = { document, chrome, URL, console, Date: DeviceDate, fetch: blocked, setTimeout: blocked, setInterval: blocked,
        localStorage: new Proxy({}, { get: blocked }), navigator: new Proxy({}, { get: blocked }), addEventListener() {},
        Intl: { DateTimeFormat: function (language, options) {
            assert.equal(options.timeZone, undefined, 'production must use the device default, not a selected/account zone');
            assert.equal(language, locale === 'zh_CN' ? 'zh-CN' : 'en');
            assert.equal(options.timeZoneName, 'longOffset');
            if (brokenIntl) throw Error('synthetic unsupported formatter');
            const formatter = new Intl.DateTimeFormat(language, { ...options, timeZone: zone });
            return { format(date) { formats.push({ instant: date.getTime(), text: formatter.format(date) }); return formatter.format(date); } };
        } } };
    context.window = context; vm.createContext(context); let controller, render;
    for (const match of html.matchAll(/<script src="([^"]+)"/g)) {
        vm.runInContext(fs.readFileSync(match[1], 'utf8'), context);
        if (match[1] === 'shared/claude-usage-snapshot.js') {
            const create = context.ClaudeUsageSnapshot.createController;
            context.ClaudeUsageSnapshot.createController = (transport, publish, options) => { render = publish; return controller = create(transport, publish, options); };
        }
    }
    const result = document.getElementById('result');
    return { document, result, calls, formats, controller, render, text: () => result.textContent,
        read: async () => { await controller.enable(); await controller.selectTab(7); await controller.selectOrganization(A); } };
}
const snapshot = raw => ({ phase: 'snapshot', organizationLabel: 'Synthetic', windows: { five_hour: { usedPercent: 0, resetAt: raw }, seven_day: null }, fetchedAt: raw });
for (const locale of ['en', 'zh_CN']) for (const [zone, raw, offset, localDate] of [
    ['UTC', '2026-01-01T00:30:00Z', 'GMT', [2026, 1, 1, 0, 30]],
    ['Asia/Kolkata', '2025-12-31T20:30:00Z', 'GMT+05:30', [2026, 1, 1, 2, 0]],
    ['America/Los_Angeles', '2026-01-01T00:30:00Z', 'GMT-08:00', [2025, 12, 31, 16, 30]],
    ['America/Los_Angeles', '2026-03-08T09:59:59Z', 'GMT-08:00', [2026, 3, 8, 1, 59]],
    ['America/Los_Angeles', '2026-03-08T10:00:00Z', 'GMT-07:00', [2026, 3, 8, 3, 0]],
    ['America/Los_Angeles', '2026-11-01T08:30:00Z', 'GMT-07:00', [2026, 11, 1, 1, 30]],
    ['America/Los_Angeles', '2026-11-01T09:30:00Z', 'GMT-08:00', [2026, 11, 1, 1, 30]]
]) test(`${locale}: ${zone} ${raw} preserves instant and marks date/time offset`, () => {
    const h = page(locale, zone); h.render(snapshot(raw));
    assert.equal(h.formats.length, 2); assert(h.formats.every(item => item.instant === Date.parse(raw)));
    assert(h.formats.every(item => item.text.includes(offset)));
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(raw)).map(p => [p.type, p.value]));
    assert.deepEqual(['year','month','day','hour','minute'].map(k => +parts[k]), localDate);
    assert(h.text().includes(h.formats[0].text));
    const originals = h.result.querySelector('details'); assert.equal(originals.open, false); assert(originals.textContent.includes(raw));
    assert.match(originals.querySelector('summary').textContent, locale === 'en' ? /Original timestamps/ : /原始时间戳/);
    assert.equal(h.calls.length, 0);
});
for (const locale of ['en', 'zh_CN']) test(`${locale}: offset encodings of the same instant render identically`, () => {
    const h = page(locale, 'Asia/Kolkata');
    for (const raw of ['2026-01-01T00:30:00Z', '2026-01-01T06:00:00+05:30', '2025-12-31T16:30:00-08:00']) h.render(snapshot(raw));
    assert.equal(new Set(h.formats.map(item => item.text)).size, 1); assert.equal(new Set(h.formats.map(item => item.instant)).size, 1);
});
for (const locale of ['en', 'zh_CN']) test(`${locale}: missing, invalid, and unavailable times stay explicit and plain text`, () => {
    const h = page(locale);
    for (const raw of [null, undefined, '', 'invalid', '2026-02-30T00:00:00Z', '2026-01-01T00:30:00', '<img src=x onerror=alert(1)>']) {
        h.render(snapshot(raw)); assert.match(h.result.children[2].textContent, locale === 'en' ? /Reset time: Unknown/ : /重置时间：未知/);
        assert.match(h.text(), locale === 'en' ? /7-day window: not provided/ : /七天窗口：未提供/);
        assert.equal(h.result.querySelectorAll('img').length, 0);
    }
    assert.equal(h.formats.length, 0);
    h.render({ ...snapshot(null), windows: { five_hour: null, seven_day: null }, unavailable: true });
    assert.match(h.text(), locale === 'en' ? /did not provide subscription windows/ : /未提供订阅窗口/);
    assert.equal(h.calls.length, 0);
});
for (const locale of ['en', 'zh_CN']) test(`${locale}: formatter failure keeps a labeled original with its explicit source offset`, () => {
    const h = page(locale, 'UTC', { brokenIntl: true }); const raw = '2026-01-01T06:00:00+05:30'; h.render(snapshot(raw));
    assert.match(h.result.children[2].textContent, locale === 'en' ? /local formatting unavailable/ : /本地格式化不可用/);
    assert(h.result.children[2].textContent.includes(raw)); assert.equal(h.calls.length, 0);
});
for (const locale of ['en', 'zh_CN']) test(`${locale}: real controller close/reselect removes formatted and original timestamps without extra API calls`, async () => {
    const h = page(locale); await h.read();
    assert(h.result.querySelector('details')); assert(h.text().includes(defaultTime));
    assert.deepEqual(h.calls, ['permission', ['organizations', null], ['organizations', null], ['usage', A]]);
    h.document.getElementById('close').dispatch('click'); assert.equal(h.result.querySelector('details'), null); assert(!h.text().includes(defaultTime));
    await h.read(); await h.controller.enable();
    assert.equal(h.result.querySelector('details'), null); assert(!h.text().includes(defaultTime));
    assert.deepEqual(h.calls, ['permission', ['organizations', null], ['organizations', null], ['usage', A], 'permission', ['organizations', null], ['organizations', null], ['usage', A], 'permission']);
});
