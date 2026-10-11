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
    const root = { document: doc, navigator: { clipboard }, LocalItabPrompts: Core, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name), location: { assign() {} } };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise });
    vm.runInContext(fs.readFileSync(`${__dirname}/../shared/dialog-focus.js`, 'utf8'), context);
    vm.runInContext(fs.readFileSync(`${__dirname}/../shared/local-prompts-view.js`, 'utf8'), context);
    const view = new root.LocalItabPromptsView.View({ host, controller: h.controller, clipboard, confirm, translate: (key, fallback) => messages[`prompts${key}`]?.message || fallback });
    view.attachDepartureGuard(); view.render(); await h.controller.start(); await settle(h.controller);
    return { ...h, h, doc, host, view, events };
}
const text = element => [element.textContent || '', ...element.children.map(text)].join(' ');
test('empty/loading/create states render real actions and required save gating', async () => {
    const h = await mount(), c = h.controller; assert.match(text(h.host), /Keep the prompts worth reusing/); assert.equal(h.view.newButton.disabled, false);
    h.view.newButton.dispatch('click'); assert.ok(c.draft()); assert.equal(h.view.editorElements.save.disabled, true);
    c.update('title', 'Title'); c.update('body', 'Body'); assert.equal(h.view.editorElements.save.disabled, false);
    h.view.main.querySelector('form').dispatch('submit'); await settle(h.controller); assert.equal(c.record().title, 'Title'); assert.equal(c.draft(), undefined); c.dispose();
});
test('Chinese catalog renders complete UI labels and user strings remain text', async () => {
    const h = await mount({ language: 'zh_CN' }); await add(h.controller, '<img src="https://bad.test/a" onerror="x">', '中文 <script>alert(1)</script>');
    assert.match(text(h.host), /提示词库/); assert.match(text(h.host), /准备使用/); assert.equal(h.host.querySelectorAll('img, script, iframe').length, 0);
    assert.equal(h.view.previewElements.preview.value, '中文 <script>alert(1)</script>'); h.controller.dispose();
});
test('variable input updates preserve field focus and do not rebuild active textarea', async () => {
    const h = await mount(); await add(h.controller); const field = h.view.main.querySelector('[data-prompt-focus="variable-topic"]'); field.focus(); field.value = 'oceans'; field.dispatch('input');
    assert.equal(h.doc.activeElement, field); assert.equal(h.view.main.querySelector('[data-prompt-focus="variable-topic"]'), field);
    assert.equal(h.view.previewElements.copy.disabled, true); const empty = h.view.previewElements.variables.children[1].querySelector('button'); empty.dispatch('click'); assert.equal(h.view.previewElements.copy.disabled, false);
    assert.equal(h.view.previewElements.preview.value, 'Explain oceans to . Again oceans.'); h.controller.dispose();
});
test('copy is user-triggered, double-click guarded and clipboard rejection leaves selectable preview', async () => {
    const wait = deferred(); let writes = 0;
    const h = await mount({ clipboard: { writeText() { writes++; return wait.promise; } } }); await add(h.controller, 'Title', 'Exact\n  code');
    assert.equal(writes, 0); const first = h.view.copy(); await h.view.copy(); assert.equal(writes, 1); wait.resolve(); await first;
    assert.match(h.view.previewElements.status.textContent, /Copied/);
    h.view.clipboard = { writeText: async () => { throw new Error('blocked'); } }; await h.view.copy(); assert.match(h.view.previewElements.status.textContent, /Copy was blocked/); assert.equal(h.view.previewElements.preview.value, 'Exact\n  code'); assert.equal(h.doc.activeElement, h.view.previewElements.preview); h.controller.dispose();
});
test('Ctrl/Meta+S only applies inside editor, not IME or repeated keydown', async () => {
    const h = await mount(); await add(h.controller); h.controller.edit(); h.controller.update('body', 'changed'); const body = h.view.main.querySelector('[data-prompt-focus="body"]');
    const before = h.h.writes; body.dispatch('keydown', { key: 's', ctrlKey: true, isComposing: true }); body.dispatch('keydown', { key: 's', metaKey: true, repeat: true }); await settle(h.controller); assert.equal(h.h.writes, before);
    const key = body.dispatch('keydown', { key: 's', metaKey: true }); assert.equal(key.prevented, true); await settle(h.controller); assert.equal(h.controller.record().body, 'changed'); h.controller.dispose();
});
test('closing dirty editor asks first; cancel keeps exact draft and focus', async () => {
    let approve = false; const questions = [];
    const h = await mount({ confirm: async options => { questions.push(options); return approve; } }); await add(h.controller); h.controller.edit(); h.controller.update('body', 'unsaved');
    await h.view.discardDraft(); assert.equal(h.controller.draft().input.body, 'unsaved'); assert.equal(questions.length, 1);
    approve = true; await h.view.discardDraft(); assert.equal(h.controller.draft(), undefined); assert.notEqual(h.controller.record().body, 'unsaved'); h.controller.dispose();
});
test('modal Escape respects IME, traps focus and returns to opener', async () => {
    const h = await mount(); h.view.newButton.focus(); const reply = h.view.dialog({ title: 'Confirm', body: 'Question', accept: 'Proceed' });
    const overlay = h.doc.body.querySelector('.prompt-dialog-overlay'); const buttons = overlay.querySelectorAll('button'); assert.equal(h.doc.activeElement, buttons[0]);
    buttons[0].dispatch('keydown', { key: 'Escape', isComposing: true }); assert.equal(h.view.openDialog, true);
    buttons[0].dispatch('keydown', { key: 'Tab', shiftKey: true }); assert.equal(h.doc.activeElement, buttons[1]);
    buttons[1].dispatch('keydown', { key: 'Escape' }); assert.equal(await reply, false); assert.equal(h.doc.activeElement, h.view.newButton); assert.equal(h.host.inert, false); h.controller.dispose();
});
test('departure guard warns on unsaved draft and ephemeral values', async () => {
    const h = await mount(); await add(h.controller); const guard = h.events.get('beforeunload'); const event = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
    let e = event(); guard(e); assert.equal(e.prevented, false); h.controller.setVariable('topic', 'value'); e = event(); guard(e); assert.equal(e.prevented, true); assert.equal(e.returnValue, '');
    h.controller.clearVariables(); h.controller.edit(); h.controller.update('title', 'draft'); e = event(); guard(e); assert.equal(e.prevented, true); h.controller.dispose();
});
test('version limit offers fresh-ID save and no permanent-delete action', async () => {
    const h = await mount(); await add(h.controller); h.controller.edit(); h.controller.update('body', 'draft'); h.controller.error = { code: 'HISTORY_LIMIT', scope: 'save' }; h.view.render();
    assert.match(text(h.host), /20 body versions/); const copy = h.view.main.querySelectorAll('button').find(button => button.textContent === 'Save draft as new prompt'); assert.ok(copy);
    copy.dispatch('click'); await settle(h.controller); assert.equal(h.controller.state.records.length, 2); assert.equal(h.controller.record().body, 'draft'); assert.doesNotMatch(text(h.host), /permanent.*delete/i); h.controller.dispose();
});
test('no unrequested network, HTML interpretation, clipboard read, provider or credential controls', () => {
    const source = fs.readFileSync(`${__dirname}/../shared/local-prompts-view.js`, 'utf8') + fs.readFileSync(`${__dirname}/../prompts.js`, 'utf8');
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|fetch\(|XMLHttpRequest|readText\(|chrome\.permissions|eval\(/);
    const page = fs.readFileSync(`${__dirname}/../prompts.html`, 'utf8'); assert.doesNotMatch(page, /https?:\/\//); assert.match(page, /shared\/workspaces\.js/);
    assert.match(source, /createPromptBackend/); assert.doesNotMatch(source, /storage\.local\.set|storageManager|\.initialize\(/);
});

function deferredClipboard() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
for (const outcome of ['resolve', 'reject']) {
    for (const change of ['variable', 'literal', 'clear', 'selection', 'version', 'variable round trip', 'literal round trip']) {
        test(`pending copy ${outcome} ignores stale ${change} preview and permits a later explicit copy`, async () => {
            const wait = deferredClipboard(), copied = [];
            const h = await mount({ clipboard: { writeText(value) { copied.push(value); return wait.promise; } } }), c = h.controller;
            const other = await add(c, 'Other', 'Different prompt');
            await add(c, 'Title', 'Explain {{topic}}'); c.setVariable('topic', 'first');
            const original = h.view.previewElements, pending = h.view.copy();
            await h.view.copy(); assert.deepEqual(copied, ['Explain first']);
            if (change === 'variable') c.setVariable('topic', 'second');
            if (change === 'literal') c.setLiteral(true);
            if (change === 'variable round trip') { c.setVariable('topic', 'second'); c.setVariable('topic', 'first'); }
            if (change === 'literal round trip') { c.setLiteral(true); c.setLiteral(false); }
            if (change === 'clear') c.clearVariables();
            if (change === 'selection') c.select(other.id);
            if (change === 'version') { c.record().version = 'changed-record-version'; c.record().currentVersionId = 'changed-version'; h.view.updatePreview(); }
            const current = h.view.previewElements, readyStatus = current.status.textContent;
            const focus = change === 'variable' ? current.variables.querySelector('textarea') : h.view.search;
            focus.focus();
            assert.equal(current.copy.disabled, true, 'only one clipboard operation may run');
            await h.view.copy(); assert.equal(copied.length, 1, 'changes never trigger automatic recopy');
            if (outcome === 'resolve') wait.resolve(); else wait.reject(new Error('blocked'));
            await pending;
            assert.equal(current.status.textContent, readyStatus, 'stale result never announces success or failure');
            assert.equal(h.doc.activeElement, focus, 'stale failure never steals focus');
            assert.equal(current.copy.disabled, change === 'clear', 'current eligibility is refreshed');
            assert.equal(h.view.copying, false);
            if (change === 'variable' || change === 'literal' || change === 'version' || change.endsWith('round trip')) assert.equal(current, original, 'exercise reused preview DOM');
            if (change === 'clear') c.setVariable('topic', 'after clear');
            const expected = c.preview().text;
            h.view.clipboard = { async writeText(value) { copied.push(value); } };
            await h.view.copy();
            assert.deepEqual(copied, ['Explain first', expected]);
            assert.match(h.view.previewElements.status.textContent, /Copied/);
            assert.equal(h.view.previewElements.copy.disabled, false);
            c.dispose();
        });
    }
    test(`pending copy ${outcome} keeps unchanged preview feedback and manual fallback`, async () => {
        const wait = deferredClipboard(), h = await mount({ clipboard: { writeText() { return wait.promise; } } });
        await add(h.controller, 'Title', 'Exact\n  code');
        const ui = h.view.previewElements; h.view.search.focus(); const pending = h.view.copy();
        if (outcome === 'resolve') wait.resolve(); else wait.reject(new Error('blocked'));
        await pending;
        assert.equal(ui.copy.disabled, false); assert.equal(ui.preview.value, 'Exact\n  code');
        assert.match(ui.status.textContent, outcome === 'resolve' ? /Copied/ : /Copy was blocked/);
        assert.equal(h.doc.activeElement, outcome === 'resolve' ? h.view.search : ui.preview);
        h.controller.dispose();
    });
    test(`pending copy ${outcome} suppresses feedback after controller disposal`, async () => {
        const wait = deferredClipboard(), copied = [];
        const h = await mount({ clipboard: { writeText(value) { copied.push(value); return wait.promise; } } });
        await add(h.controller, 'Title', 'Exact text');
        const ui = h.view.previewElements, status = ui.status.textContent, pending = h.view.copy();
        h.controller.dispose(); h.view.search.focus();
        if (outcome === 'resolve') wait.resolve(); else wait.reject(new Error('blocked'));
        await pending;
        assert.equal(ui.status.textContent, status); assert.equal(h.doc.activeElement, h.view.search);
        assert.equal(ui.copy.disabled, true); assert.equal(h.view.copying, false);
        await h.view.copy(); assert.deepEqual(copied, ['Exact text']);
    });
    for (const gate of ['busy', 'pendingCommand']) {
        test(`pending copy ${outcome} respects ${gate} on settlement`, async () => {
            const wait = deferredClipboard(), h = await mount({ clipboard: { writeText() { return wait.promise; } } }), c = h.controller;
            await add(c, 'Title', 'Exact text'); const pending = h.view.copy();
            c[gate] = gate === 'busy' ? true : { type: 'edit' };
            h.view.search.focus();
            if (outcome === 'resolve') wait.resolve(); else wait.reject(new Error('blocked'));
            await pending;
            assert.equal(h.view.previewElements.copy.disabled, true);
            assert.doesNotMatch(h.view.previewElements.status.textContent, /Copied|Copy was blocked/);
            assert.equal(h.doc.activeElement, h.view.search);
            c[gate] = gate === 'busy' ? false : null; h.view.updatePreview();
            assert.equal(h.view.previewElements.copy.disabled, false); c.dispose();
        });
    }
}
