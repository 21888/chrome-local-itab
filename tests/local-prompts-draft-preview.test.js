const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const { setup, add, tick, settle } = require('./helpers/prompts-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
async function mount({ clipboard = { writeText: async () => {} }, confirm, language = 'en' } = {}) {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true }); doc.documentElement.lang = language === 'zh_CN' ? 'zh-CN' : 'en';
    const host = doc.createElement('div'); doc.body.append(host);
    const events = new Map(), messages = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`, 'utf8'));
    const root = { document: doc, navigator: { clipboard }, LocalItabPrompts: Core, LocalItabPromptStarters: require('../shared/local-prompt-starters.js'), addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name), location: { assign() {} } };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise });
    vm.runInContext(fs.readFileSync(`${__dirname}/../shared/dialog-focus.js`, 'utf8'), context);
    vm.runInContext(fs.readFileSync(`${__dirname}/../shared/local-prompts-view.js`, 'utf8'), context);
    const view = new root.LocalItabPromptsView.View({ host, controller: h.controller, clipboard, confirm, translate: (key, fallback) => messages[`prompts${key}`]?.message || fallback });
    view.attachDepartureGuard(); view.render(); await h.controller.start(); await settle(h.controller);
    return { ...h, h, doc, host, view, events };
}
const { SESSION_VALUE_LIMIT } = require('../shared/local-prompts-controller.js');
function fresh(c, body = 'Hello {{who}}') { c.create(); c.update('body', body); c.startDraftPreview(); }
for (const language of ['en', 'zh_CN']) test(`${language}: all starters preview and explicit copy have zero persistence or source reads`, async () => {
    const copied = [], h = await mount({ language, clipboard: { writeText: async text => copied.push(text) } }), c = h.controller;
    let reads = 0; const read = h.backend.read; h.backend.read = () => { reads++; return read(); };
    for (const starter of require('../shared/local-prompt-starters.js').list(language)) {
        c.createFromStarter(starter.id, language); const input = JSON.stringify(c.draft().input); c.startDraftPreview();
        assert.equal(c.sessionReady(), false); assert.equal(c.preview(), null); assert.equal(c.sessions.size, 0);
        assert.equal(c.draftPreviewResult().complete, false);
        for (const name of c.draftPreviewResult().variables) c.setDraftVariable(name, name === c.draftPreviewResult().variables[0] ? '' : '<synthetic> {{not-recursive}}');
        assert.equal(await h.view.copyDraftPreview(), true); assert.equal(JSON.stringify(c.draft().input), input); assert.equal(c.dirty(), true);
        assert.equal(c.state.records.length, 0); assert.equal(h.writes, 0); assert.equal(reads, 0); c.discard();
    }
    assert.equal(copied.length, 4); c.dispose();
});
test('raw CRLF Unicode literal text and own prototype keys preserve exact values; empty differs from missing', async () => {
    const h = setup(), c = h.controller; await c.start(); fresh(c, ' 😀\r\n{{__proto__}}/{{constructor}}/{{__proto__}}/{{x}}\r\n');
    assert.equal(Object.getPrototypeOf(c.draftPreview.values), null); assert.equal(c.draftPreviewResult().missing.length, 3);
    assert.equal(c.setDraftVariable('__proto__', '{{constructor}}'), true); c.setDraftVariable('constructor', '<b>safe</b>'); c.setDraftVariable('x', '');
    assert.equal(c.draftPreviewResult().text, ' 😀\r\n{{constructor}}/<b>safe</b>/{{constructor}}/\r\n'); assert.equal(c.draftPreviewResult().complete, true);
    assert.equal(c.setDraftVariable('unknown', 'x'), false); assert.equal(h.writes, 0); c.dispose();
});
test('every draft field edit/revert, direct assignment and input replacement revoke tickets', async () => {
    const h = setup(), c = h.controller; await c.start(); fresh(c);
    for (const name of ['title', 'body', 'category', 'tool', 'favorite', 'tagsText']) {
        c.startDraftPreview(); c.setDraftVariable('who', 'test'); const ticket = c.draftCopyTicket(), old = c.draft().input[name];
        c.update(name, name === 'favorite' ? !old : `${old} changed`); c.update(name, old); assert.equal(c.draftCopyCurrent(ticket), false); assert.equal(c.draftPreview, null);
        c.startDraftPreview(); c.setDraftVariable('who', 'test'); const direct = c.draftCopyTicket(); c.draft().input[name] = old; assert.equal(c.draftCopyCurrent(direct), false);
    }
    c.startDraftPreview(); c.setDraftVariable('who', 'test'); const ticket = c.draftCopyTicket(); c.draft().input = { ...c.draft().input }; assert.equal(c.draftCopyCurrent(ticket), false);
    c.startDraftPreview(); c.setDraftVariable('who', 'test'); const variableTicket = c.draftCopyTicket(); c.setDraftVariable('who', 'other'); c.setDraftVariable('who', 'test'); assert.equal(c.draftCopyCurrent(variableTicket), false); c.dispose();
});
test('body/variable/count/result and shared total memory limits fail closed without hidden copy', async () => {
    const h = setup(), c = h.controller; await c.start();
    for (const body of ['', '  ', 'x'.repeat(Core.LIMITS.body + 1), Array.from({length:101}, (_, i) => `{{v${i}}}`).join('')]) { fresh(c, body); assert.equal(c.draftPreviewResult().complete, false); assert.equal(c.draftCopyTicket(), null); }
    fresh(c); c.setDraftVariable('who', 'valid'); assert.ok(c.draftCopyTicket()); assert.equal(c.setDraftVariable('who', 'x'.repeat(Core.LIMITS.value + 1)), false); assert.equal(c.draftCopyTicket(), null); assert.equal(Object.hasOwn(c.draftPreview.values, 'who'), false);
    assert.equal(c.setDraftVariable('who', ''), true); assert.ok(c.draftCopyTicket());
    c.sessions.set('budget-test', { values: { fake: 'x'.repeat(SESSION_VALUE_LIMIT) } }); assert.equal(c.setDraftVariable('who', 'x'), false); assert.equal(c.draftCopyTicket(), null); c.sessions.clear();
    fresh(c, '{{who}}'.repeat(9)); assert.equal(c.setDraftVariable('who', 'x'.repeat(32000)), false); assert.equal(c.draftCopyTicket(), null);
    fresh(c, '{{who}}'.repeat(8)); assert.equal(c.setDraftVariable('who', '😀'.repeat(32000)), true); assert.equal(c.draftPreviewResult().complete, true);
    assert.equal(h.writes, 0); c.dispose();
});
test('navigation, same-new create, discard, starter replacement and dispose clear only draft preview', async () => {
    const h = setup(), c = h.controller; await c.start(); const saved = await add(c); c.setVariable('topic', 'saved session'); const session = c.session();
    for (const action of [() => c.select(saved.id), () => c.create(), () => c.discard(), () => c.drafts.set('new', c.makeDraft())]) {
        fresh(c); c.setDraftVariable('who', 'test'); const ticket = c.draftCopyTicket(); action(); assert.equal(c.draftCopyCurrent(ticket), false); assert.equal(c.draftPreview, null); assert.equal(session.values.topic, 'saved session');
    }
    fresh(c); c.dispose(); assert.equal(c.draftPreview, null);
});
test('save keeps original placeholders one record/version and clears preview before invalid/unknown saves', async () => {
    const h = setup(), c = h.controller; await c.start(); fresh(c); c.setDraftVariable('who', 'secret ephemeral');
    assert.equal(await c.save(), false); assert.equal(c.draftPreview, null); assert.equal(c.dirty(), true); assert.equal(h.writes, 0);
    c.update('title', 'Synthetic'); c.startDraftPreview(); c.setDraftVariable('who', 'temporary'); h.failOnce(); await c.save(); await settle(c);
    assert.equal(c.draftPreview, null); if (c.pendingCommand) { assert.equal(c.startDraftPreview(), false); await c.retry(); await settle(c); }
    assert.equal(c.state.records.length, 1); assert.equal(c.record().body, 'Hello {{who}}'); assert.equal(c.record().history.length, 1); assert.equal(JSON.stringify(h.raw).includes('temporary'), false); assert.equal(c.session().values.who, undefined); c.dispose();
});
for (const reject of [false, true]) for (const change of ['edit', 'switch', 'save', 'restart', 'destroy', 'dispose', 'pagehide', 'literal', 'literal-round-trip']) test(`deferred clipboard ${reject ? 'failure' : 'success'} after ${change} has no stale feedback/focus or duplicate write`, async () => {
    const pending = {}; pending.promise = new Promise((resolve, reject) => { pending.resolve = resolve; pending.reject = reject; }); let writes = 0; const h = await mount({ clipboard: { writeText: () => { writes++; return pending.promise; } } }), c = h.controller;
    fresh(c); c.update('title', 'Synthetic'); c.startDraftPreview(); c.setDraftVariable('who', 'old'); const ui = h.view.draftPreviewElements;
    const running = h.view.copyDraftPreview(); await h.view.copyDraftPreview(); assert.equal(writes, 1);
    if (change.startsWith('literal')) { c.setDraftLiteral(true); if (change === 'literal-round-trip') c.setDraftLiteral(false); }
    if (change === 'edit') c.update('category', 'changed');
    if (change === 'switch') { c.select(null); c.select('new'); }
    if (change === 'save') await c.save();
    if (change === 'restart') { c.startDraftPreview(); c.setDraftVariable('who', 'new'); }
    if (change === 'destroy') h.view.destroy();
    if (change === 'dispose') c.dispose();
    if (change === 'pagehide') h.view.pageHide({ persisted: true });
    h.view.search.focus(); const status = ui.status.textContent; reject ? pending.reject(new Error('blocked')) : pending.resolve(); await running;
    assert.equal(ui.status.textContent, status); assert.equal(h.doc.activeElement, h.view.search); assert.equal(writes, 1); c.dispose();
});
test('current clipboard failure offers selectable preview, success reports only current copy; empty action and leaving guard work', async () => {
    const h = await mount({ clipboard: { writeText: async () => { throw new Error('blocked'); } }, confirm: async () => false }), c = h.controller;
    fresh(c); const ui = h.view.draftPreviewElements; assert.equal(ui.copy.disabled, true); ui.variables.querySelector('button').dispatch('click'); assert.equal(ui.copy.disabled, false);
    const input = JSON.stringify(c.draft().input); assert.equal(await h.view.copyDraftPreview(), false); assert.equal(h.doc.activeElement, ui.preview); assert.match(ui.status.textContent, /blocked/);
    assert.equal(JSON.stringify(c.draft().input), input); await h.view.discardDraft(); assert.equal(c.draftPreviewElements, undefined); assert.equal(c.draftPreview, ui.session);
    const event = { preventDefault() { this.prevented = true; } }; h.events.get('beforeunload')(event); assert.equal(event.prevented, true);
    assert.equal(ui.host.querySelectorAll('a, img, iframe').length, 0); assert.equal(c.sessionReady(), false); c.dispose();
});
for (const fromDraft of [true, false]) test(`one page copy lock across ${fromDraft ? 'draft to saved' : 'saved to draft'} navigation`, async () => {
    const pending = deferred(); let copies = 0; const h = await mount({ clipboard: { writeText: () => { copies++; return pending.promise; } } }), c = h.controller;
    const saved = await add(c, 'Synthetic', 'Saved plain text');
    if (fromDraft) fresh(c, 'Draft plain text');
    const writing = fromDraft ? h.view.copyDraftPreview() : h.view.copy();
    if (fromDraft) c.select(saved.id); else fresh(c, 'New draft text');
    if (fromDraft) { assert.equal(h.view.previewElements.copy.disabled, true); await h.view.copy(); }
    else { assert.equal(h.view.draftPreviewElements.copy.disabled, true); await h.view.copyDraftPreview(); }
    assert.equal(copies, 1); pending.resolve(); await writing;
    assert.equal(fromDraft ? h.view.previewElements.copy.disabled : h.view.draftPreviewElements.copy.disabled, false); c.dispose();
});
test('preview button moves keyboard focus; direct mutation clears only preview without stealing editor focus', async () => {
    const h = await mount(), c = h.controller; c.create(); c.update('body', 'Hello {{who}}');
    const start = h.view.draftPreviewHost.querySelector('button'); start.focus(); start.dispatch('click');
    assert.equal(h.doc.activeElement, h.view.draftPreviewElements.variables.querySelector('textarea'));
    c.setDraftVariable('who', 'synthetic'); const old = h.view.draftPreviewElements;
    const title = h.view.main.querySelector('[data-prompt-focus="title"]'); title.focus(); c.draft().input.category = 'changed';
    assert.equal(h.view.draftPreviewElements, null); assert.equal(old.host.querySelector('textarea'), null); assert.equal(h.doc.activeElement, title); c.dispose();
});

for (const [language, expected] of [
    ['en', 'Fill these variables before copying: criteria, optionA, optionB'],
    ['zh_CN', '复制前请填写以下变量： criteria, optionA, optionB']
]) test(`${language}: draft missing-variable status has exactly one localized separator`, async () => {
    const h = await mount({ language }), c = h.controller;
    fresh(c, '{{criteria}} / {{optionA}} / {{optionB}}');
    assert.equal(h.view.draftPreviewElements.status.textContent, expected);
    assert.equal(h.view.draftPreviewElements.copy.disabled, true);
    c.setDraftVariable('criteria', 'quality');
    assert.equal(h.view.draftPreviewElements.status.textContent, expected.replace('criteria, ', ''));
    assert.equal(h.writes, 0);
    c.dispose();
});

for (const language of ['en', 'zh_CN']) test(`${language}: draft literal checkbox preserves exact text and restores variable values without writes`, async () => {
    const copied = [], h = await mount({ language, clipboard: { writeText: async value => copied.push(value) } }), c = h.controller;
    const body = '  😀\r\n{{who}} / \\{{who}} / {{}} / {{nested{{x}}}}\r\n';
    fresh(c, body); c.setDraftVariable('who', 'synthetic');
    const before = c.draftPreviewResult().text, ui = h.view.draftPreviewElements, input = JSON.stringify(c.draft().input);
    const ticket = c.draftCopyTicket(), context = c.draftExcerptContext('who');
    ui.literal.checked = true; ui.literal.dispatch('change');
    assert.equal(ui.literal.checked, true); assert.equal(ui.variables.hidden, true);
    for (const control of ui.variables.querySelectorAll('textarea, button')) assert.equal(control.disabled, true);
    assert.equal(c.setDraftVariable('who', 'must not replace'), false); assert.equal(c.draftExcerptContext('who'), null);
    assert.equal(c.draftCopyCurrent(ticket), false); assert.equal(c.draftExcerptCurrent(context), false);
    assert.equal(c.draftPreviewResult().text, body); assert.equal(await h.view.copyDraftPreview(), true); assert.deepEqual(copied, [body]);
    ui.literal.checked = false; ui.literal.dispatch('change');
    assert.equal(ui.variables.hidden, false); assert.equal(c.draftPreview.values.who, 'synthetic'); assert.equal(c.draftPreviewResult().text, before);
    assert.equal(c.draftCopyCurrent(ticket), false); assert.equal(c.draftExcerptCurrent(context), false);
    assert.equal(JSON.stringify(c.draft().input), input); assert.equal(h.writes, 0); assert.equal(c.sessionReady(), false); c.dispose();
});
test('draft literal bypasses parsing limits but retains body, emptiness and shared memory limits', async () => {
    const h = setup(), c = h.controller; await c.start();
    const body = Array.from({ length: Core.LIMITS.variables + 1 }, (_, i) => `{{v${i}}}`).join('');
    fresh(c, body); assert.equal(c.draftCopyTicket(), null); c.setDraftLiteral(true);
    assert.equal(c.draftPreviewResult().text, body); assert.ok(c.draftCopyTicket()); c.setDraftLiteral(false); assert.equal(c.draftCopyTicket(), null);
    for (const body of ['', '  ', 'x'.repeat(Core.LIMITS.body + 1)]) { fresh(c, body); c.setDraftLiteral(true); assert.equal(c.draftCopyTicket(), null); }
    fresh(c, 'x'.repeat(Core.LIMITS.body)); c.setDraftLiteral(true); assert.ok(c.draftCopyTicket());
    c.sessions.set('synthetic', { values: { x: 'x'.repeat(SESSION_VALUE_LIMIT + 1) } }); assert.equal(c.draftCopyTicket(), null); c.sessions.clear();
    fresh(c); c.setDraftVariable('who', 'x'.repeat(Core.LIMITS.value + 1)); c.setDraftLiteral(true); assert.ok(c.draftCopyTicket()); c.setDraftLiteral(false); assert.equal(c.draftCopyTicket(), null);
    assert.equal(c.setDraftLiteral('true'), false); assert.equal(h.writes, 0); c.dispose();
});
for (const action of ['edit', 'save', 'discard', 'dispose']) test(`draft literal ${action} clears session and releases retained budget`, async () => {
    const h = setup(), c = h.controller; await c.start(); fresh(c); c.setDraftVariable('who', 'synthetic'); c.setDraftLiteral(true); const ticket = c.draftCopyTicket();
    assert.equal(c.previewValueSize(), 9);
    if (action === 'edit') c.update('title', 'Synthetic');
    else await c[action]();
    assert.equal(c.draftPreview, null); assert.equal(c.previewValueSize(), 0); assert.equal(c.draftCopyCurrent(ticket), false); c.dispose();
});

test('literal preview rejects hidden and detached control callbacks without UI divergence', async () => {
    const h = await mount(), c = h.controller; fresh(c); c.setDraftVariable('who', 'kept');
    const ui = h.view.draftPreviewElements, input = ui.variables.querySelector('textarea'); input.value = 'kept';
    c.setDraftLiteral(true); ui.variables.querySelector('button').dispatch('click');
    input.value = 'forbidden'; input.dispatch('input');
    assert.equal(input.value, 'kept'); assert.equal(c.draftPreview.values.who, 'kept');
    c.setDraftLiteral(false); assert.equal(input.value, 'kept');
    h.view.renderDraftPreview(); ui.literal.checked = true; ui.literal.dispatch('change');
    assert.equal(c.draftPreview.literal, false); assert.equal(h.view.draftPreviewElements.literal.checked, false);
    ui.variables.querySelector('button').dispatch('click'); assert.equal(c.draftPreview.values.who, 'kept'); c.dispose();
});
test('rejected visible variable text survives validation and literal round trip for correction', async () => {
    const h = await mount(), c = h.controller; fresh(c);
    const ui = h.view.draftPreviewElements, input = ui.variables.querySelector('textarea'), raw = 'x'.repeat(Core.LIMITS.value + 1);
    input.value = raw; input.dispatch('input'); assert.equal(input.value, raw); assert.equal(c.draftCopyTicket(), null);
    c.setDraftLiteral(true); assert.ok(c.draftCopyTicket()); c.setDraftLiteral(false);
    assert.equal(input.value, raw); assert.equal(c.draftCopyTicket(), null); assert.equal(c.draftPreview.values.who, undefined); c.dispose();
});
