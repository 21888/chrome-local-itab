const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const { setup, add, settle } = require('./helpers/prompts-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');
async function mount(language = 'en') {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'); doc.body.append(host);
    const copied = [], root = { document: doc, LocalItabPrompts: Core, navigator: { clipboard: { writeText: async text => copied.push(text) } } };
    vm.runInNewContext(fs.readFileSync(`${__dirname}/../shared/local-prompts-view.js`, 'utf8'), { window: root, Intl, Date, Object, Array, Boolean, String, Promise });
    const messages = language === 'fallback' ? {} : JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`, 'utf8'));
    const view = new root.LocalItabPromptsView.View({ host, controller: h.controller, translate: name => messages[`prompts${name}`]?.message || `prompts${name}` });
    view.render(); await h.controller.start(); await settle(h.controller);
    return { h, c: h.controller, doc, host, view, copied };
}
const locate = ui => ui.host.querySelectorAll('button').find(button => button.textContent === 'Go to first unfilled variable');
function draft(c, body) { c.create(); c.update('body', body); c.startDraftPreview(); }
function fields(ui) { return ui.variables.querySelectorAll('textarea'); }
test('saved preview locates first remaining variable without changing text, selection, preview or saved state', async () => {
    const h = await mount(), { c, view, doc } = h; await add(c, 'Synthetic', '{{first}} / {{empty}} / {{last}} / {{first}}');
    c.setVariable('first', 'filled'); c.setVariable('empty', ''); const ui = view.previewElements, target = fields(ui)[2];
    const button = locate({ host: view.main }); assert.ok(button, 'explicit locate button exists');
    target.selectionStart = 0; target.selectionEnd = 0;
    const before = JSON.stringify({ raw: h.h.raw, values: c.session().values, preview: ui.preview.value, status: ui.status.textContent });
    const writes = h.h.writes; view.search.focus(); button.dispatch('click');
    assert.equal(doc.activeElement, target); assert.equal(target.selectionStart, 0); assert.equal(target.selectionEnd, 0);
    assert.equal(JSON.stringify({ raw: h.h.raw, values: c.session().values, preview: ui.preview.value, status: ui.status.textContent }), before);
    assert.equal(h.h.writes, writes); assert.deepEqual(h.copied, []); c.dispose();
});
test('unsaved preview locates remaining prototype-like, Chinese and hyphenated names in template order', async () => {
    const h = await mount(), { c, view, doc } = h; draft(c, '{{__proto__}} / {{中文}} / {{a-b}} / {{constructor}} / {{__proto__}}');
    c.setDraftVariable('__proto__', 'filled'); c.setDraftVariable('中文', ''); const ui = view.draftPreviewElements, button = locate(ui);
    assert.ok(button, 'explicit draft locate button exists'); const before = JSON.stringify(c.draft().input);
    button.dispatch('click'); assert.equal(doc.activeElement, fields(ui)[2]);
    c.setDraftVariable('a-b', 'filled'); view.search.focus(); button.dispatch('click'); assert.equal(doc.activeElement, fields(ui)[3]);
    assert.equal(JSON.stringify(c.draft().input), before); assert.equal(h.h.writes, 0); assert.deepEqual(h.copied, []); c.dispose();
});
test('historical preview uses only its exact active version and returns to current remaining input', async () => {
    const h = await mount(), { c, view, doc } = h;
    const old = await add(c, 'Synthetic history', '{{old-first}} / {{old-last}}');
    c.edit(); c.update('body', '{{current-first}} / {{current-last}}'); await c.save(); await settle(c);
    c.setVariable('current-first', 'kept'); const currentUI = view.previewElements;
    c.useVersion(old.currentVersionId, old.body); c.setVariable('old-first', ''); const historicalUI = view.previewElements;
    historicalUI.locateMissing.dispatch('click'); assert.equal(doc.activeElement, fields(historicalUI)[1]);
    const writes = h.h.writes; c.returnToCurrent(); const latestUI = view.previewElements;
    view.search.focus(); historicalUI.locateMissing.dispatch('click'); currentUI.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    latestUI.locateMissing.dispatch('click'); assert.equal(doc.activeElement, fields(latestUI)[1]);
    assert.equal(c.session().values['current-first'], 'kept'); assert.equal(h.h.writes, writes); assert.deepEqual(h.copied, []); c.dispose();
});
test('100 variables use one exact input each and locate the last remaining variable in first-occurrence order', async () => {
    const h = await mount(), { c, view, doc } = h;
    const names = Array.from({ length: Core.LIMITS.variables }, (_, i) => `v${99 - i}`);
    await add(c, 'Synthetic boundary', names.map(name => `{{${name}}}`).join('\n') + '\n{{v99}}');
    const ui = view.previewElements; assert.equal(fields(ui).length, 100); assert.equal(ui.variableInputs.size, 100);
    ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, fields(ui)[0]);
    for (const name of names.slice(0, -1)) c.setVariable(name, '');
    ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, fields(ui)[99]); assert.equal(fields(ui)[99].dataset.promptFocus, 'variable-v0');
    c.setVariable('v0', 'filled'); assert.equal(ui.locateMissing.hidden, true); assert.equal(ui.locateMissing.disabled, true); c.dispose();
});
test('empty, all-filled, literal and variable-free previews have no usable locate entry', async () => {
    const h = await mount(), { c, view, doc } = h; await add(c, 'Synthetic', '{{first}} / {{last}}');
    const ui = view.previewElements; ui.variables.children[0].querySelector('button').dispatch('click'); ui.variables.children[1].querySelector('button').dispatch('click');
    assert.equal(ui.copy.disabled, false); assert.equal(ui.locateMissing.hidden, true); assert.equal(ui.locateMissing.disabled, true);
    view.search.focus(); ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    c.clearVariables(); const cleared = view.previewElements; assert.equal(cleared.locateMissing.hidden, false);
    c.setLiteral(true); assert.equal(cleared.locateMissing.hidden, true); c.setLiteral(false); assert.equal(cleared.locateMissing.disabled, false);
    draft(c, '{{first}} / {{last}}'); const du = view.draftPreviewElements;
    c.setDraftLiteral(true); assert.equal(du.locateMissing.hidden, true); c.setDraftLiteral(false); assert.equal(du.locateMissing.hidden, false);
    c.setDraftVariable('first', ''); c.setDraftVariable('last', ''); assert.equal(du.locateMissing.hidden, true); assert.equal(du.copy.disabled, false);
    draft(c, 'No variables'); assert.equal(view.draftPreviewElements.locateMissing.hidden, true);
    await add(c, 'Plain synthetic', 'No variables'); assert.equal(view.previewElements.locateMissing.hidden, true); c.dispose();
});
test('parse-count, output and capacity errors have no usable entry despite retained variables', async () => {
    const h = await mount(), { c, view } = h;
    const tooMany = Array.from({ length: Core.LIMITS.variables + 1 }, (_, i) => `{{v${i}}}`).join('');
    await add(c, 'Synthetic parse limit', tooMany); assert.equal(c.preview().error, 'VARIABLE_LIMIT'); assert.equal(view.previewElements.locateMissing.hidden, true);
    draft(c, tooMany); assert.equal(c.draftPreviewResult().error, 'VARIABLE_LIMIT'); assert.equal(view.draftPreviewElements.locateMissing.disabled, true);
    draft(c, '{{a}}/{{b}}'); c.setDraftVariable('a', 'x'.repeat(Core.LIMITS.value + 1));
    assert.equal(view.draftPreviewElements.locateMissing.hidden, true); assert.equal(view.draftPreviewElements.variableInputs.size, 2);
    draft(c, '{{a}}'.repeat(9) + '{{b}}'); c.setDraftVariable('a', 'x'.repeat(Core.LIMITS.value));
    assert.equal(c.draftPreviewResult().error, 'PREVIEW_LIMIT'); assert.equal(view.draftPreviewElements.locateMissing.hidden, true);
    await add(c, 'Synthetic capacity', '{{a}}/{{b}}'); c.setVariable('a', 'x'.repeat(Core.LIMITS.value + 1));
    assert.equal(c.error.code, 'SESSION_LIMIT'); assert.equal(view.previewElements.locateMissing.hidden, true); c.dispose();
});
test('saved and draft pending reads disable the entry immediately and retain newer search focus', async () => {
    const { deferred } = require('./helpers/task-dom-model.js');
    const h = await mount(), { c, view, doc } = h; await add(c, 'Synthetic', '{{a}}/{{b}}');
    for (const kind of ['saved', 'draft']) {
        if (kind === 'draft') draft(c, '{{a}}/{{b}}');
        const ui = kind === 'draft' ? view.draftPreviewElements : view.previewElements, read = h.h.store.read.bind(h.h.store), state = await read(), gate = deferred();
        h.h.store.read = () => gate.promise; const refreshing = c.refresh();
        assert.equal(ui.locateMissing.disabled, true); assert.equal(ui.locateMissing.hidden, true);
        view.search.focus(); ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
        gate.resolve(state); await refreshing; h.h.store.read = read;
        assert.equal(doc.activeElement, view.search); const current = kind === 'draft' ? view.draftPreviewElements : view.previewElements;
        assert.equal(current.locateMissing.disabled, false); ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    }
    c.dispose();
});
test('failed read remains locked after error-clearing navigation for both saved and new drafts', async () => {
    const h = await mount(), { c, view, doc } = h; const record = await add(c, 'Synthetic', '{{a}}');
    const read = h.h.store.read.bind(h.h.store); h.h.store.read = async () => { throw Core.fault('READ'); }; await c.refresh();
    assert.equal(view.previewElements.locateMissing.disabled, true); c.select(record.id);
    assert.equal(c.error, null); assert.equal(c.linkedPromptUnavailable, true); assert.equal(view.previewElements.locateMissing.hidden, true);
    draft(c, '{{a}}'); const ui = view.draftPreviewElements; assert.equal(ui.locateMissing.disabled, true);
    view.search.focus(); ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    h.h.store.read = read; await c.refresh(); assert.equal(view.draftPreviewElements.locateMissing.disabled, false); c.dispose();
});
test('a pending save, pending command and read uncertainty cannot reuse the old locate action', async () => {
    const { deferred } = require('./helpers/task-dom-model.js');
    const h = await mount(), { c, view, doc } = h; draft(c, '{{a}}'); c.update('title', 'Synthetic'); c.startDraftPreview();
    const ui = view.draftPreviewElements, gate = deferred(), entered = deferred(), write = h.h.backend.write;
    h.h.backend.write = async state => { entered.resolve(); await gate.promise; return write(state); };
    const saving = c.save(); await entered.promise; view.search.focus(); ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    gate.resolve(); await saving; await settle(c); assert.equal(doc.activeElement, view.search);
    const saved = view.previewElements; c.pendingCommand = { synthetic: true }; saved.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    c.pendingCommand = null; c.error = { code: 'READ', scope: 'read' }; saved.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    c.error = null; ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search); c.dispose();
});
test('old saved UI stays inert after repaint, record A-B-A, editing and reattachment', async () => {
    const h = await mount(), { c, view, doc } = h; const a = await add(c, 'Synthetic A', '{{a}}'), old = view.previewElements;
    view.render(); const repainted = view.previewElements; view.main.append(old.host); view.search.focus(); old.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    const b = await add(c, 'Synthetic B', '{{b}}'); c.select(a.id); const current = view.previewElements;
    view.main.append(repainted.host); view.search.focus(); repainted.locateMissing.dispatch('click'); old.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    current.locateMissing.dispatch('click'); assert.equal(doc.activeElement, fields(current)[0]);
    c.edit(); view.search.focus(); current.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    assert.equal(c.draft().input.body, a.body); assert.equal(c.record(b.id).body, b.body); c.dispose();
});
test('old draft UI cannot act after repaint, edit-revert, restart, close or navigation round trip', async () => {
    const h = await mount(), { c, view, doc } = h; const saved = await add(c, 'Synthetic', '{{saved}}');
    for (const change of ['repaint', 'edit-revert', 'restart', 'close', 'round-trip']) {
        draft(c, '{{a}}/{{b}}'); const ui = view.draftPreviewElements;
        if (change === 'repaint') view.renderDraftPreview();
        if (change === 'edit-revert') { c.update('body', '{{changed}}'); c.update('body', '{{a}}/{{b}}'); }
        if (change === 'restart') c.startDraftPreview();
        if (change === 'close') c.discard();
        if (change === 'round-trip') { c.select(saved.id); c.select('new'); c.startDraftPreview(); }
        view.main.append(ui.locateMissing); view.search.focus(); ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search, change);
    }
    c.dispose();
});
test('exact source/session and target map ownership are rechecked at activation without reads', async () => {
    const h = await mount(), { c, view, doc } = h; await add(c, 'Synthetic', '{{a}}/{{b}}');
    const ui = view.previewElements, record = c.record(), version = record.version, sourceBody = record.history[0].body;
    view.search.focus(); record.version++; ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search); record.version = version;
    record.history[0].body = 'Replacement {{a}}'; ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search); record.history[0].body = sourceBody;
    const parent = ui.locateMissing.parentElement; ui.locateMissing.remove(); h.doc.body.append(ui.locateMissing);
    ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search); ui.locateMissing.remove(); parent.append(ui.locateMissing);
    const input = fields(ui)[0]; input.remove(); ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    const replacement = h.doc.createElement('textarea'); replacement.dataset.promptFocus = input.dataset.promptFocus; ui.variables.append(replacement); ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    c.dispose();
});
test('hidden, inert, detached, disabled, dialog and destroyed views never acquire focus', async () => {
    const h = await mount(), { c, view, doc, host } = h; await add(c, 'Synthetic', '{{a}}');
    const ui = view.previewElements, input = fields(ui)[0];
    for (const [object, property, value] of [[doc, 'hidden', true], [host, 'hidden', true], [host, 'inert', true], [ui.host, 'hidden', true], [ui.variables, 'inert', true], [input, 'hidden', true], [input, 'disabled', true], [view, 'openDialog', true]]) {
        const before = object[property]; view.search.focus(); object[property] = value; const focus = doc.activeElement;
        ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, focus, property); object[property] = before;
    }
    view.search.focus(); host.remove(); ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, doc.body); doc.body.append(host);
    view.search.focus(); view.destroy(); ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search); c.dispose();
});
test('native button preserves cancellation, composition, repeat and modifier boundaries without automatic focus', async () => {
    const h = await mount(), { c, view, doc } = h; await add(c, 'Synthetic', '{{a}}/{{b}}');
    const ui = view.previewElements, button = ui.locateMissing; assert.equal(button.tagName, 'BUTTON'); assert.equal(button.type, 'button');
    view.search.focus();
    for (const flags of [{ defaultPrevented: true }, { isComposing: true }, { keyCode: 229 }, { repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
        button.dispatch('click', flags); assert.equal(doc.activeElement, view.search);
    }
    for (const key of ['Enter', ' ']) {
        for (const flags of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }]) assert.equal(button.dispatch('keydown', { key, ...flags }).prevented, true);
        button.dispatch('keydown', { key }); assert.equal(doc.activeElement, view.search, 'keydown does not synthesize click');
    }
    const first = fields(ui)[0]; first.value = 'synthetic'; first.dispatch('input', { isComposing: true }); assert.equal(doc.activeElement, view.search);
    button.dispatch('click', { detail: 0 }); assert.equal(doc.activeElement, fields(ui)[1]);
    c.dispose();
});
test('English, Chinese and missing-translation fallback labels are usable with zero focus side effects', async () => {
    for (const [language, expected] of [['en', 'Go to first unfilled variable'], ['zh_CN', '定位首个未填写变量'], ['fallback', 'Go to first unfilled variable']]) {
        const h = await mount(language), { c, view, doc } = h; draft(c, '{{a}}/{{b}}');
        const ui = view.draftPreviewElements; assert.equal(ui.locateMissing.textContent, expected);
        let reads = 0; const read = h.h.backend.read; h.h.backend.read = () => { reads++; return read(); };
        const before = JSON.stringify({ input: c.draft().input, values: c.draftPreview.values, preview: ui.preview.value, status: ui.status.textContent, dirty: c.dirty() });
        ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, fields(ui)[0]);
        assert.equal(JSON.stringify({ input: c.draft().input, values: c.draftPreview.values, preview: ui.preview.value, status: ui.status.textContent, dirty: c.dirty() }), before);
        assert.equal(reads, 0); assert.equal(h.h.writes, 0); assert.deepEqual(h.copied, []); c.dispose();
    }
});
test('background and modal updates do not leave an eligible action hidden after returning', async () => {
    const h = await mount(), { c, view, doc } = h; await add(c, 'Synthetic', '{{a}}');
    doc.hidden = true; view.render(); const ui = view.previewElements; assert.equal(ui.locateMissing.hidden, false);
    doc.hidden = false; ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, fields(ui)[0]);
    draft(c, '{{a}}'); const du = view.draftPreviewElements;
    view.openDialog = true; c.notify('linkedResults'); assert.equal(du.locateMissing.hidden, false);
    view.search.focus(); du.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    view.openDialog = false; du.locateMissing.dispatch('click'); assert.equal(doc.activeElement, fields(du)[0]);
    const modal = doc.createElement('section'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); doc.body.append(modal);
    view.search.focus(); du.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search);
    modal.hidden = true; du.locateMissing.dispatch('click'); assert.equal(doc.activeElement, fields(du)[0]); c.dispose();
});
test('activation recomputes missing values even before a preview notification', async () => {
    const h = await mount(), { c, view, doc } = h; await add(c, 'Synthetic', '{{a}}/{{b}}');
    const ui = view.previewElements, status = ui.status.textContent, preview = ui.preview.value;
    c.session().values.a = 'already filled'; ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, fields(ui)[1]);
    assert.equal(ui.status.textContent, status); assert.equal(ui.preview.value, preview);
    c.session().values.b = ''; view.search.focus(); ui.locateMissing.dispatch('click'); assert.equal(doc.activeElement, view.search); c.dispose();
});
