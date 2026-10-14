const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const html = fs.readFileSync('claude-usage-experiment.html', 'utf8');
const source = fs.readFileSync('claude-usage-experiment.js', 'utf8');
function harness() {
    const document = createDocument(), calls = [], listeners = new Map();
    for (const [id, tag] of [['enable','button'],['close','button'],['back','a'],['result','section']]) { const el = document.createElement(tag); el.id = id; document.body.append(el); }
    document.getElementById('result').tabIndex = -1;
    let render;
    const controller = { close: () => { calls.push('close'); render({ phase: 'disabled' }); }, enable: () => calls.push('enable'), selectTab: id => calls.push(['tab', id]), selectOrganization: id => calls.push(['org', id]), dispose: () => calls.push('dispose') };
    const window = { addEventListener: (event, listener) => listeners.set(event, listener) };
    const chrome = { i18n: { getMessage: key => require('../_locales/zh_CN/messages.json')[key]?.message || '' } };
    vm.runInNewContext(fs.readFileSync('i18n.js', 'utf8'), { document, window, chrome });
    vm.runInNewContext(source, { document, window, chrome, ClaudeUsageSnapshot: { validTimestamp: require('../shared/claude-usage-snapshot').validTimestamp, createController: (_, publish) => { render = publish; return controller; } } });
    return { document, calls, listeners, render, result: document.getElementById('result'), text: () => document.getElementById('result').children.map(el => el.textContent).join('\n') };
}
test('settings experiment entry is local, discoverable, bilingual, and grants nothing on open', () => {
    const options = fs.readFileSync('options.html', 'utf8');
    assert.match(options, /id="claude-usage-open" href="claude-usage-experiment.html"/);
    assert.ok(!options.includes('src="shared/claude-usage-snapshot.js"'));
    for (const locale of ['en','zh_CN']) { const strings = require(`../_locales/${locale}/messages.json`); for (const key of ['claudeUsageTitle','claudeUsageDescription','claudeUsageCaution','claudeUsageOpen']) assert.ok(strings[key].message); }
    assert.match(fs.readFileSync('shared/settings-search.js','utf8'), /"target": "claude-usage-settings", "tab": "privacy"/);
    const notices = JSON.stringify(require('../_locales/zh_CN/messages.json'));
    assert.match(notices, /真实账号尚未验收/); assert.match(notices, /默认关闭/); assert.match(notices, /不是账号绑定/); assert.match(notices, /计费证据/); assert.match(notices, /Chrome 原生弹窗/);
    assert.match(html, /src="i18n.js"/); assert.match(html, /https:\/\/claude.ai\/\*/); assert.match(html, /scripting/);
    const h = harness(); assert.deepEqual(h.calls, ['close']); assert.match(h.text(), /已关闭/);
});
test('enable is explicit, close and back clear immediately, pagehide clears and unload disposes', () => {
    const h = harness(); h.document.getElementById('enable').dispatch('click'); assert.equal(h.calls.at(-1), 'enable');
    h.render({ phase: 'snapshot', name: 'Synthetic', organizationLabel: 'Synthetic (11111111…111111111111)', windows: { five_hour: null, seven_day: null }, fetchedAt: 'synthetic', unavailable: true });
    h.document.getElementById('close').dispatch('click'); assert.match(h.text(), /已关闭/); assert.ok(!h.text().includes('Synthetic'));
    h.document.getElementById('back').dispatch('click'); assert.equal(h.calls.at(-1), 'close'); h.listeners.get('pagehide')(); assert.equal(h.calls.at(-1), 'close'); h.listeners.get('unload')(); assert.equal(h.calls.at(-1), 'dispose');
});
test('all core error codes have specific readable text; errors never display incoming raw text', () => {
    const h = harness();
    for (const error of ['wrong_page','invalid_selection','challenge','login_required','access_denied','rate_limited','temporary_error','http_error','non_json','too_large','unsupported_response','schema_changed','timeout','network_or_redirect','document_changed','permission_denied','organizations_changed','read_failed']) { h.render({ phase: 'error', error }); assert.ok(h.text().length >= 5); assert.ok(!h.text().includes('无法读取，请重新选择')); }
    h.render({ phase: 'error', error: '<img src=x onerror=alert(1)>' }); assert.ok(!h.text().includes('<img')); assert.equal(h.result.children.length, 1);
});
test('empty tabs and zero organizations explain recovery; no auto-select, pure text duplicate names', () => {
    const h = harness(); h.render({ phase: 'tabs', tabs: [] }); assert.match(h.text(), /未发现/);
    h.render({ phase: 'organizations', organizations: [] }); assert.match(h.text(), /没有返回可选组织/);
    h.render({ phase: 'organizations', organizations: [{ id: '11111111-1111-1111-1111-111111111111', name: '<img synthetic>', displayLabel: '<img synthetic> (11111111…111111111111)' }, { id: '22222222-2222-2222-2222-222222222222', name: '<img synthetic>', displayLabel: '<img synthetic> (22222222…222222222222)' }] });
    assert.deepEqual(h.calls, ['close']); const buttons = h.result.querySelectorAll('button'); assert.equal(buttons.length, 2); assert.notEqual(buttons[0].textContent, buttons[1].textContent); assert.equal(h.result.querySelectorAll('img').length, 0);
    buttons[1].dispatch('click'); assert.deepEqual(h.calls.at(-1), ['org','22222222-2222-2222-2222-222222222222']);
});
test('selection controls hand focus to status when replaced, and snapshot null is never synthetic zero', () => {
    const h = harness(); h.render({ phase: 'tabs', tabs: [{ id: 7 }] }); h.result.querySelector('button').focus(); h.render({ phase: 'loading' }); assert.equal(h.document.activeElement, h.result);
    h.render({ phase: 'snapshot', name: 'Synthetic', organizationLabel: 'Synthetic (11111111…111111111111)', windows: { five_hour: { usedPercent: 0, resetAt: null }, seven_day: null }, fetchedAt: '2026-10-13T10:00:00Z' }); assert.match(h.text(), /已用 0%/); assert.match(h.text(), /重置时间：未知/); assert.match(h.text(), /七天窗口：未提供该窗口/);
});
test('settings entry has existing padded content wrapper so outward focus ring is not clipped at section edge', () => {
    const options = fs.readFileSync('options.html', 'utf8');
    const section = options.match(/<section[^>]*id="claude-usage-settings"[\s\S]*?<\/section>/)[0];
    assert.match(section, /<div class="settings-grid">\s*<div class="setting-group full-width">\s*<p[^>]*data-i18n="claudeUsageCaution"[\s\S]*?<a[^>]*id="claude-usage-open"[\s\S]*?<\/a>\s*<\/div>\s*<\/div>/);
    const css = fs.readFileSync('options.css', 'utf8');
    assert.match(css, /\.settings-grid\s*\{[^}]*padding:\s*var\(--spacing-xl\)/);
    assert.match(css, /a:focus-visible[\s\S]*?outline:\s*2px solid var\(--text-accent\);\s*outline-offset:\s*3px/);
});
