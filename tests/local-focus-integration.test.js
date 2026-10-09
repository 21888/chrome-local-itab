const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createDocument } = require(require('node:path').resolve(__dirname, require('node:fs').existsSync(require('node:path').resolve(__dirname, '../storage.js')) ? 'helpers/task-dom-model' : '../../chrome-local-itab/tests/helpers/task-dom-model'));
const project = process.env.ITAB_SOURCE_ROOT || path.resolve(__dirname, fs.existsSync(path.resolve(__dirname, '../storage.js')) ? '..' : '../integration-model');
test('staged lifecycle waits only for writes, never traps a running persisted session', () => {
    const document = createDocument(); let reloads = 0; const window = { location: { reload() { reloads++; } } };
    vm.runInNewContext(fs.readFileSync(path.join(project, 'shared/local-content-lifecycle.js'), 'utf8'), { document, window });
    window.localFocusView = { controller: { pending: null } }; assert.equal(window.LocalItabContentLifecycle.reload(), true); assert.equal(reloads, 1);
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    window.localFocusView.controller.pending = {}; assert.equal(window.LocalItabContentLifecycle.reload(), false); assert.equal(reloads, 1);
    window.localFocusView.controller.pending = null; assert.equal(window.LocalItabContentLifecycle.reload(), true);
});
test('wiring uses separate host, matching CSS, early dependencies, click exclusion and no settings defaults', () => {
    for (const page of ['newtab', 'options']) {
        const html = fs.readFileSync(path.join(project, page + '.html'), 'utf8');
        for (const module of ['store', 'controller', 'view']) assert(html.indexOf(`shared/local-focus-${module}.js`) < html.indexOf(`<script src="${page}.js"`));
        assert(html.includes('local-focus.css'));
    }
    const source = fs.readFileSync(path.join(project, 'newtab.js'), 'utf8'); assert(source.includes('window.localItabFocusVisible === true ||'));
    assert(source.includes('.local-tasks-card, .local-focus-card, .tasks-overlay,'));
    const css = fs.readFileSync(path.join(project, 'dashboard-templates.css'), 'utf8'); assert(css.includes(':is(.info-card, .local-tasks-card, .local-focus-card, .local-scratchpad-card)'));
    const storage = fs.readFileSync(path.join(project, 'storage.js'), 'utf8'); assert(storage.includes("['__localItabPersonalTasksV1', '__localItabFocusV1', '__localItabScratchpadV1']"));
});
test('English and Chinese messages cover the same keys', () => {
    const read = locale => Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(project, '_locales', locale, 'messages.json'), 'utf8'))).filter(([key]) => key.startsWith('focus')));
    const en = read('en'), cn = read('zh_CN'); assert(Object.keys(en).length > 20); assert.deepEqual(Object.keys(en).sort(), Object.keys(cn).sort());
    for (const messages of [en, cn]) for (const item of Object.values(messages)) assert(item.message.length);
});
