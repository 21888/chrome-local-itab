const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const html = fs.readFileSync('claude-usage-experiment.html', 'utf8');
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', C = '11111111-2222-2222-2222-111111111111';
const errors = ['invalid_selection','http_error','unsupported_response','read_failed','permission_denied','wrong_page','document_changed','organizations_changed','login_required','access_denied','challenge','rate_limited','temporary_error','schema_changed','non_json','network_or_redirect','timeout','too_large'];
const tick = () => new Promise(setImmediate);
const event = () => { const set = new Set(); return { addListener: fn => set.add(fn), removeListener: fn => set.delete(fn), fire: (...args) => [...set].forEach(fn => fn(...args)) }; };
// Render the production HTML's actual text/control nodes, then execute every
// production script in HTML order. Only Chrome catalog/transport are synthetic.
function page(locale = 'en', { api = 'normal', organizations = [{ id: A, name: '' }, { id: B, name: '' }] } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), calls = [], listeners = new Map();
    document.documentElement.lang = html.match(/<html[^>]*lang="([^"]+)"/)[1];
    for (const match of html.matchAll(/<(title|h1|p|button|a|section)\b([^>]*)>([^<]*)<\/\1>/g)) {
        const node = document.createElement(match[1]); node.textContent = match[3];
        for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) { node.setAttribute(attr[1], attr[2]); if (attr[1].startsWith('data-')) node.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = attr[2]; if (attr[1] === 'id') node.id = attr[2]; if (attr[1] === 'tabindex') node.tabIndex = Number(attr[2]); }
        document.body.append(node);
    }
    const catalogName = locale === 'zh_CN' ? 'zh_CN' : 'en', catalog = JSON.parse(fs.readFileSync(`_locales/${catalogName}/messages.json`));
    const blocked = () => { throw Error('No storage, account identity, network or browser-language guessing allowed'); };
    const chrome = {
        i18n: { getMessage(key) { if (api === 'throw') throw Error('synthetic unavailable'); return api === 'missing' ? '' : catalog[key]?.message || ''; }, getUILanguage: blocked },
        permissions: { request: async () => { calls.push(['permission']); return true; }, contains: async () => true, onRemoved: event() },
        tabs: { query: async () => [{ id: 7, url: 'https://claude.ai/' }], get: async id => ({ id, url: 'https://claude.ai/' }), onUpdated: event(), onRemoved: event() },
        scripting: { executeScript: async request => { calls.push(request.args); return [{ frameId: 0, documentId: 'synthetic-document', result: request.args[0] === 'organizations' ? { organizations } : { windows: { five_hour: { usedPercent: 0, resetAt: null }, seven_day: null } } }]; } },
        storage: new Proxy({}, { get: blocked }), identity: new Proxy({}, { get: blocked })
    };
    if (api === 'absent') delete chrome.i18n;
    const context = { document, chrome, URL, console, fetch: blocked, localStorage: new Proxy({}, { get: blocked }), navigator: { get language() { return blocked(); } }, addEventListener: (type, fn) => listeners.set(type, fn) }; context.window = context;
    vm.createContext(context); let controller, render, options;
    for (const match of html.matchAll(/<script src="([^"]+)"/g)) {
        vm.runInContext(fs.readFileSync(match[1], 'utf8'), context);
        if (match[1] === 'shared/claude-usage-snapshot.js') { const create = context.ClaudeUsageSnapshot.createController; context.ClaudeUsageSnapshot.createController = (transport, publish, config) => { render = publish; options = config; return controller = create(transport, publish, config); }; }
    }
    const result = document.getElementById('result'), text = () => result.children.map(node => node.textContent).join('\n');
    const staticText = () => document.querySelectorAll('title,h1,p,button,a').filter(node => !result.contains(node)).map(node => node.textContent).join('\n');
    return { document, calls, listeners, controller, render, options, result, text, staticText, catalog, ready: async () => { await controller.enable(); await controller.selectTab(7); } };
}
for (const locale of ['en', 'zh_CN', 'es', 'zh-TW']) test(`${locale}: actual page uses the selected Chrome catalog for static text, language, ARIA and all dynamic phases`, async () => {
    const h = page(locale), zh = locale === 'zh_CN';
    assert.equal(h.document.documentElement.lang, zh ? 'zh-CN' : 'en'); assert.equal(h.calls.length, 0);
    assert.equal(h.document.querySelector('title').textContent, h.catalog.claudeUsageTitle.message);
    assert.match(h.document.getElementById('enable').textContent, zh ? /启用/ : /Enable/);
    assert.match(h.staticText(), zh ? /默认关闭/ : /Off by default/);
    assert.match(h.result.getAttribute('aria-label'), zh ? /快照/ : /snapshot/);
    assert.match(h.text(), zh ? /已关闭/ : /Closed/);
    const notices = h.staticText();
    h.render({ phase: 'idle' }); assert.match(h.text(), zh ? /已关闭/ : /Closed/);
    for (const phase of ['enabling', 'loading']) { h.render({ phase }); assert.match(h.text(), zh ? /读取中/ : /reading/); }
    h.render({ phase: 'page_changed' }); assert.match(h.text(), zh ? /清除/ : /cleared/);
    h.render({ phase: 'tabs', tabs: [] }); assert.match(h.text(), zh ? /未发现/ : /No open/);
    h.render({ phase: 'organizations', organizations: [] }); assert.match(h.text(), zh ? /没有返回/ : /No organizations/);
    await h.controller.enable(); assert.match(h.result.querySelector('button').textContent, zh ? /标签页 #7/ : /tab #7/);
    await h.controller.selectTab(7); const label = h.result.querySelectorAll('button')[1].textContent;
    assert.match(label, zh ? /未命名组织/ : /Unnamed organization/);
    h.result.querySelectorAll('button')[1].focus(); h.result.querySelectorAll('button')[1].dispatch('click'); await tick();
    assert(h.text().includes(label)); assert.equal(h.controller.getState().organizationLabel, label); assert.equal(h.document.activeElement, h.result);
    assert.match(h.text(), zh ? /已用 0%/ : /used 0%/); assert.match(h.text(), zh ? /未知/ : /Unknown/); assert.match(h.text(), zh ? /七天窗口：未提供/ : /7-day window: not provided/);
    assert.deepEqual(h.calls.map(call => Array.from(call)), [['permission'], ['organizations', null], ['organizations', null], ['usage', B]]);
    h.render({ phase: 'snapshot', organizationLabel: label, windows: { five_hour: null, seven_day: null }, unavailable: true, fetchedAt: 'synthetic time' });
    assert.match(h.text(), zh ? /未提供订阅窗口/ : /did not provide subscription windows/);
    assert.equal(h.staticText(), notices);
    h.document.getElementById('close').dispatch('click'); assert.match(h.text(), zh ? /已关闭/ : /Closed/); assert(!h.text().includes(label));
});
for (const locale of ['en', 'zh_CN']) test(`${locale}: every classified error is localized, specific and plain text; unknown errors use safe fallback`, () => {
    const h = page(locale), seen = new Set();
    for (const error of errors) { h.render({ phase: 'error', error }); const text = h.text(); assert(text.length >= 5); assert(!text.includes(error)); assert(locale === 'zh_CN' ? /[\u3400-\u9fff]/.test(text) : !/[\u3400-\u9fff]/.test(text)); seen.add(text); }
    assert.equal(seen.size, errors.length);
    for (const error of ['<img src=x onerror=alert(1)>', 'constructor', '__proto__']) { h.render({ phase: 'error', error }); assert.match(h.text(), locale === 'zh_CN' ? /无法读取/ : /Unable to read/); assert(!h.text().includes(error)); }
    assert.equal(h.document.querySelectorAll('img').length, 0); assert.equal(h.calls.length, 0);
});
for (const api of ['missing', 'throw', 'absent']) test(`${api} messages retain readable English safety notices and runtime fallback without extra effects`, async () => {
    const h = page('zh_CN', { api }); assert.equal(h.document.documentElement.lang, 'en');
    assert.match(h.staticText(), /Off by default/); assert.match(h.staticText(), /not account binding/); assert.match(h.result.getAttribute('aria-label'), /snapshot/);
    assert(!h.staticText().includes('claudeUsage')); assert.match(h.text(), /Closed/);
    await h.ready(); const label = h.result.querySelector('button').textContent; assert.match(label, /Unnamed organization/);
    await h.controller.selectOrganization(A); assert(h.text().includes(label)); assert.match(h.text(), /used 0%/); assert(!h.text().includes('claudeUsage'));
});
for (const locale of ['en', 'zh_CN']) test(`${locale}: raw organization names, fragment collisions and token-like text are never translated or reinterpreted`, async () => {
    const name = '<b>未命名组织 Unnamed organization {organization} $&</b>', h = page(locale, { organizations: [{ id: A, name }, { id: C, name }] });
    await h.ready(); const label = h.result.querySelectorAll('button')[1].textContent; assert.equal(label, `${name} (${C})`);
    await h.controller.selectOrganization(C); assert(h.text().includes(label)); assert.equal(h.controller.getState().name, name); assert.equal(h.document.querySelectorAll('b').length, 0);
    h.listeners.get('pagehide')(); assert(!h.text().includes(name));
});
test('both catalogs cover static/dynamic keys, identical format tokens, and every safety boundary', () => {
    const en = page('en'), zh = page('zh_CN');
    const english = en.staticText();
    for (const phrase of ['Off by default', 'Not yet tested with real accounts', 'each time', 'scripting', 'https://claude.ai/*', 'Cookie', 'token', 'not account binding', 'billing evidence', 'internal API', 'used percentages', 'remaining quota', '10-second timeout', 'does not revoke']) assert(english.includes(phrase), phrase);
    for (const phrase of ['默认关闭', '真实账号尚未验收', '每次', 'scripting', 'https://claude.ai/*', 'Cookie', 'token', '不是账号绑定', '计费证据', '内部接口', '已用百分比', '剩余额度', '10 秒', '不自动撤销']) assert(zh.staticText().includes(phrase), phrase);
    const fallback = JSON.parse(fs.readFileSync('claude-usage-experiment.js', 'utf8').match(/const fallback = (\{[\s\S]*?\n    \});/)[1]);
    for (const [key, text] of Object.entries(fallback)) assert.equal(en.catalog[`claudeUsage${key}`].message, text);
    const keys = Object.keys(en.catalog).filter(key => key.startsWith('claudeUsage'));
    for (const key of keys) { assert(zh.catalog[key], key); assert.deepEqual(en.catalog[key].message.match(/\{\w+\}/g)?.sort() || [], zh.catalog[key].message.match(/\{\w+\}/g)?.sort() || [], key); }
    assert(html.indexOf('src="i18n.js"') < html.indexOf('src="claude-usage-experiment.js"')); assert.equal(en.calls.length + zh.calls.length, 0);
});
