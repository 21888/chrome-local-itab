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
const text = element => [element.textContent || '', ...element.children.map(text)].join(' ');
const Starters = require('../shared/local-prompt-starters.js');
for (const language of ['en', 'zh_CN']) test(`${language}: four legal, independent starter texts`, () => {
    const rows = Starters.list(language); assert.equal(rows.length, 4); assert.equal(new Set(rows.map(x => x.id)).size, 4);
    for (const row of rows) { const preview = Core.previewTemplate(row.body); assert.ok(preview.variables.length); assert.equal(preview.variables.length, row.id === 'compare' ? 3 : 1); assert.equal(preview.missing.length, preview.variables.length); }
    rows[0].body = 'mutated'; assert.notEqual(Starters.get('summary', language).body, 'mutated');
    assert.equal(Starters.get('__proto__', language), null); assert.equal(Starters.get({}, language), null);
    assert.deepEqual(Starters.list('fr'), Starters.list('en'));
});
test('load stays in memory, immediately dirty, and only explicit save writes one record/version', async () => {
    const h = setup(), c = h.controller; await c.start(); let reads = 0; const read = h.backend.read; h.backend.read = () => { reads++; return read(); };
    assert.equal(c.createFromStarter('summary'), true); assert.equal(c.dirty(), true); assert.equal(c.hasUncommittedWork(), true); assert.equal(c.sessionReady(), false); assert.equal(h.writes, 0); assert.equal(reads, 0);
    const input = JSON.stringify(c.draft().input); assert.equal(c.createFromStarter('rewrite'), false); assert.equal(JSON.stringify(c.draft().input), input);
    const first = c.save(), second = c.save(); await Promise.all([first, second]); await settle(c); assert.equal(h.writes, 1); assert.equal(c.state.records.length, 1); assert.equal(c.record().history.length, 1); c.dispose();
});
test('state, invalid ID, busy, pending, reading and disposal block starter loads', async () => {
    const h = setup(), c = h.controller; assert.equal(c.createFromStarter('summary'), false); await c.start();
    assert.equal(c.createFromStarter('bad'), false);
    for (const [field, value, original] of [['busy', true, false], ['pendingCommand', {}, null], ['pendingReadGeneration', 5, null], ['linkedPromptUnavailable', true, false]]) { c[field] = value; assert.equal(c.createFromStarter('summary'), false); c[field] = original; }
    c.dispose(); assert.equal(c.createFromStarter('summary'), false); assert.equal(h.writes, 0);
});
test('other drafts and variable sessions survive template loading and navigation', async () => {
    const h = setup(), c = h.controller; await c.start(); const saved = await add(c); c.setVariable('topic', 'personal topic'); const session = c.session(); c.edit(); c.update('title', 'unsaved edit'); const old = c.draft();
    assert.equal(c.createFromStarter('compare'), true); const fresh = c.draft(); c.select(saved.id); assert.equal(c.draft(), old); assert.equal(c.session(), session); assert.equal(session.values.topic, 'personal topic'); c.select('new'); assert.equal(c.draft(), fresh); assert.equal(c.dirty(), true); c.dispose();
});
test('unknown committed save retries original command without duplicate starter', async () => {
    const h = setup(), c = h.controller; await c.start(); c.createFromStarter('actions'); h.failOnce(); await c.save(); await settle(c);
    if (c.pendingCommand) { const cmd = c.pendingCommand; assert.equal(c.createFromStarter('rewrite'), false); await c.retry(); await settle(c); assert.ok(cmd); }
    assert.equal(c.state.records.length, 1); assert.equal(c.state.records[0].history.length, 1); c.dispose();
});
for (const language of ['en', 'zh_CN']) test(`${language}: full preview, Escape focus return, cancellation and load have no IO`, async () => {
    let copies = 0; const h = await mount({ language, clipboard: { writeText: async () => { copies++; } } }), c = h.controller;
    let reads = 0; const read = h.backend.read; h.backend.read = () => { reads++; return read(); };
    const card = h.view.main.querySelector('[data-prompt-focus="starter-summary"]'); assert.ok(card); card.focus(); const cancel = h.view.previewStarter('summary');
    let overlay = h.doc.body.querySelector('.prompt-dialog-overlay'); assert.equal(overlay.querySelector('pre').textContent, Starters.get('summary', language).body);
    assert.equal(h.doc.activeElement.tagName, 'H2'); overlay.querySelector('button').dispatch('keydown', { key: 'Escape' }); assert.equal(await cancel, false); assert.equal(h.doc.activeElement, card); assert.equal(c.draft(), undefined);
    const load = h.view.previewStarter('summary'); overlay = h.doc.body.querySelector('.prompt-dialog-overlay'); overlay.querySelectorAll('button')[1].dispatch('click'); assert.equal(await load, true);
    assert.equal(c.draft().input.body, Starters.get('summary', language).body); assert.equal(h.doc.activeElement.dataset.promptFocus, 'title'); assert.equal(c.dirty(), true); assert.equal(h.writes, 0); assert.equal(reads, 0); assert.equal(copies, 0);
    assert.ok(h.view.main.querySelector('details')); assert.equal(h.host.querySelectorAll('img, iframe, script').length, 0); c.dispose();
});
test('dirty close and leaving are guarded; denied discard preserves starter draft', async () => {
    const h = await mount({ confirm: async () => false }), c = h.controller; c.createFromStarter('summary'); const draft = c.draft(); await h.view.discardDraft(); assert.equal(c.draft(), draft);
    const event = { preventDefault() { this.prevented = true; } }; h.events.get('beforeunload')(event); assert.equal(event.prevented, true); await h.view.leave('newtab.html'); assert.equal(c.draft(), draft); c.dispose();
});
test('existing draft is continued rather than overwritten after full preview', async () => {
    const h = await mount(), c = h.controller; c.createFromStarter('summary'); const draft = c.draft(); const result = h.view.previewStarter('rewrite');
    const overlay = h.doc.body.querySelector('.prompt-dialog-overlay'); assert.match(overlay.querySelectorAll('button')[1].textContent, /Continue/); overlay.querySelectorAll('button')[1].dispatch('click'); await result; assert.equal(c.draft(), draft); assert.equal(h.writes, 0); c.dispose();
});
test('selection changes or disposal cancel open preview and prevent stale load', async () => {
    for (const action of [c => c.create(), c => c.dispose(), c => { c.busy = true; c.notify(); }]) {
        const h = await mount(), c = h.controller, preview = h.view.previewStarter('summary'); action(c); assert.equal(await preview, false); assert.equal(c.dirty('new'), false); assert.equal(h.writes, 0); c.dispose();
    }
});
test('retired gallery cards and continue controls cannot act on newer views', async () => {
    const h = await mount(), c = h.controller; const card = h.view.main.querySelector('.prompt-starter-card'); c.create(); assert.equal(card.isConnected, false); card.dispatch('click'); assert.ok(!h.view.openDialog);
    c.createFromStarter('summary'); const section = h.view.main.querySelector('.prompt-starters'); const continueButton = section.querySelector('button'); const draft = c.draft(); c.select(null); continueButton.dispatch('click'); assert.equal(c.selected, null); assert.equal(c.drafts.get('new'), draft); assert.equal(h.writes, 0); c.dispose();
});
test('canceled preview continuation cannot clear a newer preview guard', async () => {
    const h = await mount(), c = h.controller; const first = h.view.previewStarter('summary');
    h.doc.body.querySelector('.prompt-dialog-overlay button').dispatch('click');
    const second = h.view.previewStarter('compare'); const check = h.view.checkStarterDialog; await first;
    assert.equal(h.view.checkStarterDialog, check); c.create(); assert.equal(await second, false); assert.equal(c.dirty('new'), false); c.dispose();
});
